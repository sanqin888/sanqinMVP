import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AwsSnsWebhookService } from './aws-sns.webhook.service';

const resolveRemoteIp = (req: Request): string =>
  req.ip ?? req.socket?.remoteAddress ?? 'unknown';

@Controller('webhooks')
export class AwsSnsWebhookController {
  constructor(private readonly service: AwsSnsWebhookService) {}

  @Post('aws-sns')
  async handle(@Req() req: Request, @Res() res: Response) {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : '';

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return res.status(HttpStatus.BAD_REQUEST).send('invalid json');
    }

    const snsPayload = payload as unknown as {
      Type?: string;
      MessageId?: string;
      TopicArn?: string;
      Subject?: string;
      Message?: string;
      Timestamp?: string;
      Signature?: string;
      SignatureVersion?: string;
      SigningCertURL?: string;
      SubscribeURL?: string;
      Token?: string;
    };

    const isValid = await this.service.verifySignature(snsPayload);
    if (!isValid) {
      await this.service.recordSignatureInvalid({
        rawBody,
        headers: req.headers,
        requestUrl: req.originalUrl,
        remoteIp: resolveRemoteIp(req),
      });
      return res.status(HttpStatus.UNAUTHORIZED).send('invalid signature');
    }

    const webhookEventId = await this.service.recordWebhookEvent({
      payload: snsPayload,
      rawBody,
      headers: req.headers,
      requestUrl: req.originalUrl,
      remoteIp: resolveRemoteIp(req),
    });

    const type = snsPayload.Type ?? '';
    if (type === 'SubscriptionConfirmation') {
      await this.service.confirmSubscription(snsPayload.SubscribeURL);
    }

    if (webhookEventId && type === 'Notification') {
      await this.service.recordNotificationEvent(snsPayload, webhookEventId);
    }

    return res.status(HttpStatus.OK).send('ok');
  }
}
