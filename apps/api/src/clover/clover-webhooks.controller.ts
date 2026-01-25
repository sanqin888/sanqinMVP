// apps/api/src/clover/clover-webhooks.controller.ts
import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('webhooks') // 最终路由：/api/v1/webhooks/clover-hco
export class CloverHcoWebhookController {
  private readonly logger = new Logger(CloverHcoWebhookController.name);
  private readonly sqsClient = new SQSClient({
    region: process.env.AWS_REGION,
  });
  private readonly queueUrl = process.env.CLOVER_SQS_QUEUE_URL;

  constructor() {}

  @Post('clover-hco')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest,
    @Res() res: Response,
    @Headers('clover-signature') signature?: string,
  ) {
    // ---- 1. 还原 rawBody ----
    let rawBody: Buffer;
    const body: unknown = req.body;

    if (Buffer.isBuffer(req.rawBody)) {
      rawBody = req.rawBody;
    } else if (Buffer.isBuffer(body)) {
      rawBody = body;
    } else if (typeof body === 'string') {
      rawBody = Buffer.from(body, 'utf8');
    } else if (body && typeof body === 'object') {
      rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    } else {
      rawBody = Buffer.alloc(0);
    }

    const secret = process.env.CLOVER_HCO_SIGNING_SECRET || '';

    // ---- 2. 签名校验（如果配置了 secret）----
    if (secret && rawBody.length > 0) {
      if (!signature) {
        this.logger.warn('Clover HCO webhook missing Clover-Signature header');
        // 不直接 401，避免配置错误时整个支付流程卡死；只是记录日志
        return res.status(200).send('missing-signature');
      } else {
        const [tPart, v1Part] = signature.split(',').map((s) => s.trim());
        const ts = tPart?.startsWith('t=') ? tPart.slice(2) : undefined;
        const v1 = v1Part?.startsWith('v1=') ? v1Part.slice(3) : undefined;

        if (ts && v1) {
          const signedPayload = `${ts}.${rawBody.toString('utf8')}`;
          const mac = createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

          const sigOk =
            mac.length === v1.length &&
            timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(v1, 'hex'));

          if (!sigOk) {
            this.logger.warn(
              `Invalid Clover HCO signature: expected HMAC for ts=${ts}, header=${signature}`,
            );
            // 为了容忍配置问题，这里仍然返回 200，让 Clover 不重试
            return res.status(200).send('invalid-signature');
          }
        } else {
          this.logger.warn(
            `Malformed Clover-Signature header received: ${signature}`,
          );
        }
      }
    }

    // ---- 3. 解析 JSON payload ----
    let payload: unknown;
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch (error) {
      this.logger.warn(
        `Clover HCO webhook JSON parse failed: ${String(error)}`,
      );
      payload = {};
    }

    if (!this.queueUrl) {
      this.logger.error('CLOVER_SQS_QUEUE_URL is not configured.');
      return res.status(500).send('queue-not-configured');
    }

    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(payload),
          MessageAttributes: {
            Source: { DataType: 'String', StringValue: 'CloverWebhook' },
          },
        }),
      );
      this.logger.log(`Payload sent to SQS: ${this.queueUrl}`);
      return res.status(200).send('queued');
    } catch (error) {
      this.logger.error(`Failed to send message to SQS: ${String(error)}`);
      return res.status(500).send('queue-error');
    }
  }
}
