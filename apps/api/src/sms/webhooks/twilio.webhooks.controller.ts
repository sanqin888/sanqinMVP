//apps/api/src/sms/webhooks/twilio.webhooks.controller.ts
import { Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  MessagingChannel,
  MessagingProvider,
  MessagingSendStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import twilio from 'twilio';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';

const resolveRemoteIp = (req: Request): string =>
  req.ip ?? req.socket?.remoteAddress ?? 'unknown';

function parseTwilioFormBody(req: Request): {
  raw: string;
  params: Record<string, string>;
} {
  // 因为你对 /api/v1/webhooks/twilio 使用了 express.raw({ type: "*/*" })
  // 所以 req.body 是 Buffer（或 string），需要手动解析 x-www-form-urlencoded
  const rawBody: unknown = req.body;
  let raw = '';
  if (typeof rawBody === 'string') {
    raw = rawBody;
  } else if (Buffer.isBuffer(rawBody)) {
    raw = rawBody.toString('utf8');
  } else if (
    rawBody &&
    typeof rawBody === 'object' &&
    'toString' in rawBody &&
    typeof (rawBody as { toString: () => string }).toString === 'function'
  ) {
    raw = (rawBody as { toString: () => string }).toString();
  }

  const params = new URLSearchParams(raw);
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return { raw, params: obj };
}

@Controller('webhooks/twilio')
export class TwilioWebhooksController {
  private readonly logger = new AppLogger(TwilioWebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  // ✅ 入站短信（包含用户回复/STOP/HELP/START）
  @Post('sms/inbound')
  @HttpCode(200)
  async inboundSms(@Req() req: Request, @Res() res: Response) {
    const { raw, params } = parseTwilioFormBody(req);
    const requestUrl = buildRequestUrl(req);
    const signature =
      req.header('X-Twilio-Signature') ??
      req.header('x-twilio-signature') ??
      '';

    if (!this.verifySignature(requestUrl, signature, params)) {
      await this.recordSignatureInvalid({
        rawBody: raw,
        requestUrl,
        headers: req.headers,
        remoteIp: resolveRemoteIp(req),
      });
      return res.status(401).send('invalid signature');
    }

    const from = params.From;
    const to = params.To;
    const sid = params.MessageSid;

    await this.recordWebhookEvent({
      eventKind: 'SMS_INBOUND',
      idempotencyKey: sid
        ? `twilio:inbound:${sid}`
        : this.fingerprint(`twilio:inbound:${raw}`),
      rawBody: raw,
      requestUrl,
      headers: req.headers,
      remoteIp: resolveRemoteIp(req),
      params,
      providerMessageId: sid ?? null,
      toAddressNorm: normalizePhone(to),
      fromAddressNorm: normalizePhone(from),
    });

    this.logger.log(
      `[twilio inbound sms] sid=${sid ?? 'unknown'} from=${maskPhone(from)} to=${maskPhone(to)} bodyLength=${params.Body?.length ?? 0}`,
    );

    // 不自动回复：返回空 TwiML
    res
      .type('text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }

  // ✅ 短信状态回执（你发出去的短信状态）
  @Post('sms/status')
  @HttpCode(200)
  async smsStatus(@Req() req: Request, @Res() res: Response) {
    const { raw, params } = parseTwilioFormBody(req);
    const requestUrl = buildRequestUrl(req);
    const signature =
      req.header('X-Twilio-Signature') ??
      req.header('x-twilio-signature') ??
      '';

    if (!this.verifySignature(requestUrl, signature, params)) {
      await this.recordSignatureInvalid({
        rawBody: raw,
        requestUrl,
        headers: req.headers,
        remoteIp: resolveRemoteIp(req),
      });
      return res.status(401).send('invalid signature');
    }

    const webhookEventId = await this.recordWebhookEvent({
      eventKind: 'SMS_STATUS',
      idempotencyKey: params.MessageSid
        ? `twilio:status:${params.MessageSid}:${params.MessageStatus}`
        : this.fingerprint(`twilio:status:${raw}`),
      rawBody: raw,
      requestUrl,
      headers: req.headers,
      remoteIp: resolveRemoteIp(req),
      params,
      providerMessageId: params.MessageSid ?? null,
      toAddressNorm: normalizePhone(params.To),
      fromAddressNorm: normalizePhone(params.From),
      occurredAt: new Date(),
    });

    if (webhookEventId) {
      const { eventType, sendStatus } = mapTwilioStatus(params.MessageStatus);
      const send = await this.prisma.messagingSend.findFirst({
        where: {
          provider: MessagingProvider.TWILIO,
          providerMessageId: params.MessageSid ?? undefined,
        },
      });

      await this.prisma.messagingDeliveryEvent.create({
        data: {
          sendId: send?.id ?? null,
          webhookEventId,
          channel: MessagingChannel.SMS,
          provider: MessagingProvider.TWILIO,
          eventType,
          providerMessageId: params.MessageSid ?? null,
          status: params.MessageStatus ?? null,
          errorCode: params.ErrorCode ?? null,
          errorMessage: params.ErrorMessage ?? null,
          occurredAt: new Date(),
          payload: params as Prisma.InputJsonValue,
        },
      });

      if (send && sendStatus) {
        await this.prisma.messagingSend.update({
          where: { id: send.id },
          data: {
            statusLatest: sendStatus,
            errorCodeLatest: params.ErrorCode ?? null,
            errorMessageLatest: params.ErrorMessage ?? null,
          },
        });
      }
    }

    this.logger.log(
      `[twilio sms status] sid=${params.MessageSid ?? 'unknown'} status=${params.MessageStatus ?? 'unknown'} to=${maskPhone(params.To)} from=${maskPhone(params.From)} errorCode=${params.ErrorCode ?? 'none'}`,
    );

    res.send('ok');
  }

  // ✅ 关掉 voice：来电直接拒接
  @Post('voice/inbound')
  @HttpCode(200)
  inboundCall(@Res() res: Response) {
    res
      .type('text/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`,
      );
  }

  private verifySignature(
    requestUrl: string,
    signature: string,
    params: Record<string, string>,
  ): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!authToken || !signature) {
      return false;
    }
    const validateRequest = (twilio as TwilioValidator).validateRequest;
    return validateRequest(authToken, signature, requestUrl, params);
  }

  private async recordSignatureInvalid(params: {
    rawBody: string;
    requestUrl: string;
    headers: Record<string, unknown>;
    remoteIp: string;
  }) {
    const idempotencyKey = this.fingerprint(
      `twilio:signature-invalid:${params.requestUrl}:${params.rawBody}`,
    );
    const now = new Date();
    await this.upsertWebhookEvent({
      idempotencyKey,
      eventKind: 'SIGNATURE_INVALID',
      rawBody: params.rawBody,
      requestUrl: params.requestUrl,
      headers: params.headers,
      remoteIp: params.remoteIp,
      now,
    });
  }

  private async recordWebhookEvent(params: {
    eventKind: string;
    idempotencyKey: string;
    rawBody: string;
    requestUrl: string;
    headers: Record<string, unknown>;
    remoteIp: string;
    params: Record<string, string>;
    providerMessageId: string | null;
    toAddressNorm: string | null;
    fromAddressNorm: string | null;
    occurredAt?: Date;
  }): Promise<string | null> {
    const now = new Date();
    try {
      const webhookEvent = await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          channel: MessagingChannel.SMS,
          provider: MessagingProvider.TWILIO,
          eventKind: params.eventKind,
          requestUrl: params.requestUrl,
          headersJson: params.headers as Prisma.InputJsonValue,
          rawBody: params.rawBody,
          paramsJson: params.params as Prisma.InputJsonValue,
          remoteIp: params.remoteIp,
          providerMessageId: params.providerMessageId,
          toAddressNorm: params.toAddressNorm,
          fromAddressNorm: params.fromAddressNorm,
          occurredAt: params.occurredAt ?? null,
          lastSeenAt: now,
        },
      });
      return webhookEvent.id;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.messagingWebhookEvent.update({
          where: { idempotencyKey: params.idempotencyKey },
          data: { lastSeenAt: now },
        });
        return null;
      }
      throw error;
    }
  }

  private async upsertWebhookEvent(params: {
    idempotencyKey: string;
    eventKind: string;
    rawBody: string;
    requestUrl: string;
    headers: Record<string, unknown>;
    remoteIp: string;
    now: Date;
  }) {
    try {
      await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          channel: MessagingChannel.SMS,
          provider: MessagingProvider.TWILIO,
          eventKind: params.eventKind,
          requestUrl: params.requestUrl,
          headersJson: params.headers as Prisma.InputJsonValue,
          rawBody: params.rawBody,
          remoteIp: params.remoteIp,
          lastSeenAt: params.now,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.messagingWebhookEvent.update({
          where: { idempotencyKey: params.idempotencyKey },
          data: { lastSeenAt: params.now },
        });
        return;
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private fingerprint(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 32);
  }
}

function maskPhone(phone: string | undefined): string {
  if (!phone) return 'unknown';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '***';

  const visible = digits.slice(-4);
  return `***${visible}`;
}

type TwilioValidator = {
  validateRequest: (
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, string>,
  ) => boolean;
};

const buildRequestUrl = (req: Request): string => {
  const forwardedProto = req.header('x-forwarded-proto');
  const protocol = forwardedProto ?? req.protocol;
  const host = req.header('host') ?? '';
  return `${protocol}://${host}${req.originalUrl}`;
};

const normalizePhone = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return null;
  return `+${digits}`;
};

const mapTwilioStatus = (
  status?: string,
): { eventType: string; sendStatus?: MessagingSendStatus } => {
  const normalized = status?.toLowerCase() ?? 'unknown';
  if (normalized === 'delivered') {
    return {
      eventType: 'DELIVERED',
      sendStatus: MessagingSendStatus.DELIVERED,
    };
  }
  if (normalized === 'sent' || normalized === 'queued') {
    return { eventType: 'SENT', sendStatus: MessagingSendStatus.SENT };
  }
  if (normalized === 'undelivered') {
    return { eventType: 'UNDELIVERED', sendStatus: MessagingSendStatus.FAILED };
  }
  if (normalized === 'failed') {
    return { eventType: 'FAILED', sendStatus: MessagingSendStatus.FAILED };
  }
  return { eventType: status ?? 'UNKNOWN' };
};
