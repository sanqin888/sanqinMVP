//apps/api/src/email/webhooks/sendgrid-email.webhook.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, EmailSuppressionReason } from '@prisma/client';
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

  async process(raw: unknown) {
    if (!Array.isArray(raw)) {
      this.logger.warn('SendGrid webhook payload is not an array');
      return;
    }

    for (const ev of raw as SendGridEvent[]) {
      await this.processOne(ev);
    }
  }

  private async processOne(ev: SendGridEvent) {
    const eventType = (ev.event ?? 'Unknown').trim() || 'Unknown';
    const eventKey = eventType.toLowerCase();

    const email = normalizeEmail(ev.email);
    const destinations = email ? [email] : [];

    const messageId = ev.sg_message_id ?? 'unknown';
    const mailTimestamp = ev.timestamp ? new Date(ev.timestamp * 1000) : null;
    const now = new Date();

    const idempotencyKey = ev.sg_event_id
      ? `sg:${ev.sg_event_id}`
      : this.fingerprint(`${messageId}:${eventKey}:${email ?? ''}:${ev.timestamp ?? ''}`);

    // 1) record EmailEvent (idempotent)
    try {
      await this.prisma.emailEvent.create({
        data: {
          idempotencyKey,
          messageId,
          eventType,
          source: null,
          destinations,
          mailTimestamp,
          feedbackId: null,
          payload: ev as Prisma.InputJsonValue,
          lastSeenAt: now,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.emailEvent.update({
          where: { idempotencyKey },
          data: { lastSeenAt: now },
        });
      } else {
        throw error;
      }
    }

    // 2) automation rules
    // Complaint (spamreport) -> suppression(COMPLAINT)
    if (eventKey === 'spamreport') {
      await this.upsertSuppression(email, EmailSuppressionReason.COMPLAINT, messageId);
      return;
    }

    // Bounce-like -> suppression(BOUNCE)
    if (eventKey === 'bounce' || eventKey === 'blocked' || eventKey === 'dropped') {
      await this.upsertSuppression(email, EmailSuppressionReason.BOUNCE, messageId);
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
    reason: EmailSuppressionReason,
    sourceMessageId: string,
  ) {
    if (!email) return;

    // create if missing
    await this.prisma.emailSuppression.createMany({
      data: [{ email, reason, sourceMessageId, feedbackId: null }],
      skipDuplicates: true,
    });

    // complaint always wins
    if (reason === EmailSuppressionReason.COMPLAINT) {
      await this.prisma.emailSuppression.update({
        where: { email },
        data: { reason, sourceMessageId, feedbackId: null },
      });
      return;
    }

    // bounce updates only if not already complaint
    await this.prisma.emailSuppression.updateMany({
      where: {
        email,
        reason: { notIn: [EmailSuppressionReason.COMPLAINT] },
      },
      data: { reason, sourceMessageId, feedbackId: null },
    });
  }

  private fingerprint(input: string): string {
    return 'sg:' + createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
