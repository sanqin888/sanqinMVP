import { Injectable, Logger } from '@nestjs/common';
import {
  MessagingChannel,
  MessagingProvider,
  MessagingSendStatus,
  Prisma,
} from '@prisma/client';
import { createVerify, createHash } from 'crypto';
import https from 'https';
import { PrismaService } from '../../prisma/prisma.service';

type SnsMessage = {
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

@Injectable()
export class AwsSnsWebhookService {
  private readonly logger = new Logger(AwsSnsWebhookService.name);
  private readonly certCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async verifySignature(payload: SnsMessage): Promise<boolean> {
    if (!payload.Signature || !payload.SigningCertURL) {
      return false;
    }
    if (!this.isValidCertUrl(payload.SigningCertURL)) {
      return false;
    }

    const certificate = await this.fetchCertificate(payload.SigningCertURL);
    if (!certificate) {
      return false;
    }

    const stringToSign = buildStringToSign(payload);
    if (!stringToSign) {
      return false;
    }

    const verifier = createVerify('RSA-SHA1');
    verifier.update(stringToSign);
    verifier.end();
    return verifier.verify(certificate, payload.Signature, 'base64');
  }

  async confirmSubscription(subscribeUrl?: string) {
    if (!subscribeUrl) {
      this.logger.warn('SNS SubscribeURL missing for confirmation');
      return;
    }
    await new Promise<void>((resolve, reject) => {
      https
        .get(subscribeUrl, (res) => {
          res.on('data', () => undefined);
          res.on('end', resolve);
        })
        .on('error', reject);
    });
  }

  async recordSignatureInvalid(params: {
    rawBody: string;
    headers: Record<string, unknown>;
    requestUrl: string;
    remoteIp: string;
  }) {
    const idempotencyKey = this.fingerprint(
      `sns:signature-invalid:${params.requestUrl}:${params.rawBody}`,
    );
    const now = new Date();
    await this.upsertWebhookEvent({
      idempotencyKey,
      eventKind: 'SIGNATURE_INVALID',
      rawBody: params.rawBody,
      headers: params.headers,
      requestUrl: params.requestUrl,
      remoteIp: params.remoteIp,
      now,
      provider: MessagingProvider.AWS_SES,
      channel: MessagingChannel.EMAIL,
    });
  }

  async recordWebhookEvent(params: {
    payload: SnsMessage;
    rawBody: string;
    headers: Record<string, unknown>;
    requestUrl: string;
    remoteIp: string;
  }): Promise<boolean> {
    const idempotencyKey = params.payload.MessageId
      ? `sns:${params.payload.MessageId}`
      : this.fingerprint(`sns:${params.rawBody}`);
    const now = new Date();
    return this.createWebhookEvent({
      idempotencyKey,
      eventKind: `SNS_${params.payload.Type ?? 'UNKNOWN'}`,
      payload: params.payload,
      rawBody: params.rawBody,
      headers: params.headers,
      requestUrl: params.requestUrl,
      remoteIp: params.remoteIp,
      now,
    });
  }

  async recordDeliveryEvent(payload: SnsMessage) {
    if (!payload.Message) return;
    const parsed = parseJson(payload.Message);
    const channel = resolveChannel(parsed);
    const provider =
      channel === MessagingChannel.SMS
        ? MessagingProvider.AWS_SMS
        : MessagingProvider.AWS_SES;
    const mailRecord = getRecord(parsed?.mail);
    const providerMessageId =
      getString(mailRecord?.messageId) ??
      getString(parsed?.messageId) ??
      payload.MessageId ??
      null;
    const eventType =
      getString(parsed?.notificationType) ??
      getString(parsed?.eventType) ??
      payload.Type ??
      'SNS_NOTIFICATION';

    const send = providerMessageId
      ? await this.prisma.messagingSend.findFirst({
          where: { provider, providerMessageId },
        })
      : null;
    const mappedStatus = mapSnsStatus(eventType);

    await this.prisma.messagingDeliveryEvent.create({
      data: {
        sendId: send?.id ?? null,
        channel,
        provider,
        eventType,
        providerMessageId,
        status:
          getString(parsed?.notificationType) ??
          getString(parsed?.eventType) ??
          null,
        occurredAt: payload.Timestamp ? new Date(payload.Timestamp) : null,
        payload: (parsed ?? payload) as Prisma.InputJsonValue,
      },
    });

    if (send && mappedStatus) {
      await this.prisma.messagingSend.update({
        where: { id: send.id },
        data: { statusLatest: mappedStatus },
      });
    }
  }

  private async createWebhookEvent(params: {
    idempotencyKey: string;
    eventKind: string;
    payload: SnsMessage;
    rawBody: string;
    headers: Record<string, unknown>;
    requestUrl: string;
    remoteIp: string;
    now: Date;
  }): Promise<boolean> {
    const parsedMessage = parseJson(params.payload.Message ?? '');
    const channel = resolveChannel(parsedMessage);
    const provider =
      channel === MessagingChannel.SMS
        ? MessagingProvider.AWS_SMS
        : MessagingProvider.AWS_SES;

    try {
      await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          channel,
          provider,
          eventKind: params.eventKind,
          requestUrl: params.requestUrl,
          headersJson: params.headers as Prisma.InputJsonValue,
          rawBody: params.rawBody,
          paramsJson: params.payload as Prisma.InputJsonValue,
          remoteIp: params.remoteIp,
          providerMessageId: params.payload.MessageId ?? null,
          occurredAt: params.payload.Timestamp
            ? new Date(params.payload.Timestamp)
            : null,
          lastSeenAt: params.now,
        },
      });
      return true;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.messagingWebhookEvent.update({
          where: { idempotencyKey: params.idempotencyKey },
          data: { lastSeenAt: params.now },
        });
        return false;
      }
      throw error;
    }
  }

  private async upsertWebhookEvent(params: {
    idempotencyKey: string;
    eventKind: string;
    rawBody: string;
    headers: Record<string, unknown>;
    requestUrl: string;
    remoteIp: string;
    now: Date;
    provider: MessagingProvider;
    channel: MessagingChannel;
  }) {
    try {
      await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          channel: params.channel,
          provider: params.provider,
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

  private isValidCertUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' && url.hostname.endsWith('.amazonaws.com')
      );
    } catch {
      return false;
    }
  }

  private async fetchCertificate(url: string): Promise<string | null> {
    if (this.certCache.has(url)) {
      return this.certCache.get(url) ?? null;
    }
    const pem = await new Promise<string | null>((resolve) => {
      https
        .get(url, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        })
        .on('error', () => resolve(null));
    });
    if (pem) {
      this.certCache.set(url, pem);
    }
    return pem;
  }

  private fingerprint(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

const buildStringToSign = (payload: SnsMessage): string | null => {
  const type = payload.Type ?? '';
  if (type === 'Notification') {
    const lines = [
      'Message',
      payload.Message ?? '',
      'MessageId',
      payload.MessageId ?? '',
    ];
    if (payload.Subject) {
      lines.push('Subject', payload.Subject);
    }
    lines.push(
      'Timestamp',
      payload.Timestamp ?? '',
      'TopicArn',
      payload.TopicArn ?? '',
      'Type',
      payload.Type ?? '',
    );
    return lines.join('\n') + '\n';
  }
  if (
    type === 'SubscriptionConfirmation' ||
    type === 'UnsubscribeConfirmation'
  ) {
    const lines = [
      'Message',
      payload.Message ?? '',
      'MessageId',
      payload.MessageId ?? '',
      'SubscribeURL',
      payload.SubscribeURL ?? '',
      'Timestamp',
      payload.Timestamp ?? '',
      'Token',
      payload.Token ?? '',
      'TopicArn',
      payload.TopicArn ?? '',
      'Type',
      payload.Type ?? '',
    ];
    return lines.join('\n') + '\n';
  }
  return null;
};

const parseJson = (value: string): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const resolveChannel = (
  payload: Record<string, unknown> | null,
): MessagingChannel => {
  if (!payload) return MessagingChannel.EMAIL;
  if (
    'notificationType' in payload ||
    'eventType' in payload ||
    'mail' in payload ||
    'complaint' in payload ||
    'bounce' in payload
  ) {
    return MessagingChannel.EMAIL;
  }
  if ('delivery' in payload || 'sms' in payload || 'phoneNumber' in payload) {
    return MessagingChannel.SMS;
  }
  return MessagingChannel.EMAIL;
};

const mapSnsStatus = (eventType: string): MessagingSendStatus | undefined => {
  const key = eventType.toLowerCase();
  if (key.includes('bounce')) return MessagingSendStatus.BOUNCED;
  if (key.includes('complaint')) return MessagingSendStatus.COMPLAINED;
  if (key.includes('delivered') || key.includes('delivery'))
    return MessagingSendStatus.DELIVERED;
  if (key.includes('sent') || key.includes('send'))
    return MessagingSendStatus.SENT;
  if (key.includes('fail') || key.includes('reject'))
    return MessagingSendStatus.FAILED;
  return undefined;
};
