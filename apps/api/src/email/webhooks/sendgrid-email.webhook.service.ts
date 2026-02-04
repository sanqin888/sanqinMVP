//apps/api/src/email/webhooks/sendgrid-email.webhook.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  MessagingChannel,
  MessagingProvider,
  MessagingSendStatus,
  Prisma,
  SuppressionReason,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email';

type SendGridEvent = {
  event?: string;
  email?: string;
  timestamp?: number;

  sg_message_id?: string;
  sg_event_id?: string;

  reason?: string;
  status?: string;

  // if you later send customArgs / categories, webhook will include them too:
  custom_args?: Record<string, string>;
  category?: string[] | string;
};

@Injectable()
export class SendGridEmailWebhookService {
  private readonly logger = new Logger(SendGridEmailWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(
    raw: unknown,
    context: {
      rawBody: string;
      headers: Record<string, unknown>;
      requestUrl: string;
      remoteIp: string;
    },
  ) {
    if (!Array.isArray(raw)) {
      this.logger.warn('SendGrid webhook payload is not an array');
      return;
    }

    for (const ev of raw as SendGridEvent[]) {
      await this.processOne(ev, context);
    }
  }

  async recordSignatureInvalid(params: {
    rawBody: string;
    headers: Record<string, unknown>;
    requestUrl: string;
    remoteIp: string;
  }) {
    const idempotencyKey = this.fingerprint(
      `sendgrid:signature-invalid:${params.requestUrl}:${params.rawBody}`,
    );
    const now = new Date();
    try {
      await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey,
          channel: MessagingChannel.EMAIL,
          provider: MessagingProvider.SENDGRID,
          eventKind: 'SIGNATURE_INVALID',
          requestUrl: params.requestUrl,
          headersJson: params.headers as Prisma.InputJsonValue,
          rawBody: params.rawBody,
          remoteIp: params.remoteIp,
          lastSeenAt: now,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.messagingWebhookEvent.update({
          where: { idempotencyKey },
          data: { lastSeenAt: now },
        });
        return;
      }
      throw error;
    }
  }

  private async processOne(
    ev: SendGridEvent,
    context: {
      rawBody: string;
      headers: Record<string, unknown>;
      requestUrl: string;
      remoteIp: string;
    },
  ) {
    const eventType = (ev.event ?? 'Unknown').trim() || 'Unknown';
    const eventKey = eventType.toLowerCase();

    const email = normalizeEmail(ev.email);
    const messageId = ev.sg_message_id ?? 'unknown';
    const mailTimestamp = ev.timestamp ? new Date(ev.timestamp * 1000) : null;
    const now = new Date();

    const idempotencyKey = ev.sg_event_id
      ? `sendgrid:event:${ev.sg_event_id}`
      : this.fingerprint(
          `sendgrid:event:${messageId}:${eventKey}:${email ?? ''}:${ev.timestamp ?? ''}`,
        );

    // 1) record webhook audit (idempotent)
    let webhookCreated = true;
    try {
      await this.prisma.messagingWebhookEvent.create({
        data: {
          idempotencyKey,
          channel: MessagingChannel.EMAIL,
          provider: MessagingProvider.SENDGRID,
          eventKind: 'SENDGRID_EVENT',
          requestUrl: context.requestUrl,
          headersJson: context.headers as Prisma.InputJsonValue,
          rawBody: context.rawBody,
          paramsJson: ev as Prisma.InputJsonValue,
          remoteIp: context.remoteIp,
          providerMessageId: messageId,
          toAddressNorm: email ?? null,
          occurredAt: mailTimestamp,
          lastSeenAt: now,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.messagingWebhookEvent.update({
          where: { idempotencyKey },
          data: { lastSeenAt: now },
        });
        webhookCreated = false;
      } else {
        throw error;
      }
    }

    if (webhookCreated) {
      const send = await this.prisma.messagingSend.findFirst({
        where: {
          provider: MessagingProvider.SENDGRID,
          providerMessageId: messageId,
        },
      });
      const { sendStatus } = mapSendGridStatus(eventKey);
      await this.prisma.messagingDeliveryEvent.create({
        data: {
          sendId: send?.id ?? null,
          channel: MessagingChannel.EMAIL,
          provider: MessagingProvider.SENDGRID,
          eventType,
          providerMessageId: messageId,
          status: ev.status ?? null,
          errorMessage: ev.reason ?? null,
          occurredAt: mailTimestamp,
          payload: ev as Prisma.InputJsonValue,
        },
      });
      if (send && sendStatus) {
        await this.prisma.messagingSend.update({
          where: { id: send.id },
          data: {
            statusLatest: sendStatus,
            errorMessageLatest: ev.reason ?? null,
          },
        });
      }
    }

    // 2) automation rules
    // Complaint (spamreport) -> suppression(COMPLAINT)
    if (eventKey === 'spamreport') {
      await this.upsertSuppression(
        email,
        SuppressionReason.COMPLAINT,
        messageId,
      );
      return;
    }

    // Bounce-like -> suppression(BOUNCE)
    if (
      eventKey === 'bounce' ||
      eventKey === 'blocked' ||
      eventKey === 'dropped'
    ) {
      await this.upsertSuppression(
        email,
        SuppressionReason.BOUNCE_HARD,
        messageId,
      );
      return;
    }

    // Unsubscribe: update user marketing flag (transactional mails still ok)
    if (eventKey === 'unsubscribe' || eventKey === 'group_unsubscribe') {
      await this.applyMarketingOptOut(email);
      return;
    }

    // deferred / delivered / open / click: we keep EmailEvent only
  }

  private async applyMarketingOptOut(email: string | null) {
    if (!email) return;

    const updated = await this.prisma.user.updateMany({
      where: { email },
      data: { marketingEmailOptIn: false },
    });

    if (updated.count > 0) {
      this.logger.log(`Marketing opt-out applied for ${email}`);
    }
  }

  private async upsertSuppression(
    email: string | null,
    reason: SuppressionReason,
    sourceMessageId: string,
  ) {
    if (!email) return;

    // create if missing
    await this.prisma.messagingSuppression.createMany({
      data: [
        {
          channel: MessagingChannel.EMAIL,
          addressNorm: email,
          addressRaw: email,
          reason,
          sourceProvider: MessagingProvider.SENDGRID,
          sourceMessageId,
          feedbackId: null,
        },
      ],
      skipDuplicates: true,
    });

    // complaint always wins
    if (reason === SuppressionReason.COMPLAINT) {
      await this.prisma.messagingSuppression.update({
        where: {
          channel_addressNorm: {
            channel: MessagingChannel.EMAIL,
            addressNorm: email,
          },
        },
        data: {
          reason,
          sourceProvider: MessagingProvider.SENDGRID,
          sourceMessageId,
          feedbackId: null,
        },
      });
      return;
    }

    // bounce updates only if not already complaint
    await this.prisma.messagingSuppression.updateMany({
      where: {
        channel: MessagingChannel.EMAIL,
        addressNorm: email,
        reason: { notIn: [SuppressionReason.COMPLAINT] },
      },
      data: {
        reason,
        sourceProvider: MessagingProvider.SENDGRID,
        sourceMessageId,
        feedbackId: null,
      },
    });
  }

  private fingerprint(input: string): string {
    return (
      'sg:' + createHash('sha256').update(input).digest('hex').slice(0, 32)
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

const mapSendGridStatus = (
  eventKey: string,
): { sendStatus?: MessagingSendStatus } => {
  switch (eventKey) {
    case 'processed':
      return { sendStatus: MessagingSendStatus.SENT };
    case 'delivered':
      return { sendStatus: MessagingSendStatus.DELIVERED };
    case 'bounce':
    case 'blocked':
    case 'dropped':
      return { sendStatus: MessagingSendStatus.BOUNCED };
    case 'spamreport':
      return { sendStatus: MessagingSendStatus.COMPLAINED };
    case 'deferred':
      return { sendStatus: MessagingSendStatus.FAILED };
    case 'sent':
      return { sendStatus: MessagingSendStatus.SENT };
    default:
      return {};
  }
};
