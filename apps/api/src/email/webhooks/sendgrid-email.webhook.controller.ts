//apps/api/src/email/webhook/sendgrid-email.webhook.controller.ts
import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SendGridEmailWebhookVerifier } from './sendgrid-email.webhook.verifier';
import { SendGridEmailWebhookService } from './sendgrid-email.webhook.service';

@Controller('webhooks')
export class SendGridEmailWebhookController {
  constructor(
    private readonly verifier: SendGridEmailWebhookVerifier,
    private readonly service: SendGridEmailWebhookService,
  ) {}

  @Post('sendgrid-email')
  async handle(@Req() req: Request, @Res() res: Response) {
    const publicKey = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim();
    if (!publicKey) {
      return res
        .status(HttpStatus.NOT_IMPLEMENTED)
        .send('missing SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY');
    }

    const signature =
      req.header('X-Twilio-Email-Event-Webhook-Signature') ?? undefined;
    const timestamp =
      req.header('X-Twilio-Email-Event-Webhook-Timestamp') ?? undefined;

    // Because main.ts uses express.raw() for this route, req.body should be Buffer
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    try {
      this.verifier.verifyOrThrow({
        signatureBase64: signature,
        timestamp,
        rawBody,
        publicKey,
      });
    } catch {
      return res.status(HttpStatus.UNAUTHORIZED).send('invalid signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(HttpStatus.BAD_REQUEST).send('invalid json');
    }

    await this.service.process(payload);
    return res.status(HttpStatus.OK).send('ok');
  }
}
