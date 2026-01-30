import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { EmailSuppressionReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../common/utils/email';

const DEFAULT_EVENT_TYPE = 'Unknown';

type SesMail = {
  messageId?: string;
  source?: string;
  destination?: string[];
  timestamp?: string;
};

type SesRecipient = {
  emailAddress?: string;
};

type SesBounce = {
  feedbackId?: string;
  bounceType?: string;
  bouncedRecipients?: SesRecipient[];
};

type SesComplaint = {
  feedbackId?: string;
  complaintFeedbackType?: string;
  complainedRecipients?: SesRecipient[];
};

type SesEventPayload = {
  eventType?: string;
  mail?: SesMail;
  bounce?: SesBounce;
  complaint?: SesComplaint;
};

@Injectable()
export class SesEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SesEventProcessor.name);
  private consumer?: Consumer;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const queueUrl = process.env.SES_EVENTS_SQS_QUEUE_URL;
    if (!queueUrl) {
      this.logger.warn(
        'SES_EVENTS_SQS_QUEUE_URL not configured, SES event processor disabled.',
      );
      return;
    }

    this.consumer = Consumer.create({
      queueUrl,
      sqs: new SQSClient({ region: process.env.AWS_REGION }),
      handleMessage: async (message) => {
        try {
          await this.processMessage(message);
        } catch (error) {
          this.logger.error(
            `Failed to process SES event: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
        return message;
      },
    });

    this.consumer.on('error', (err) => {
      this.logger.error(`SQS Consumer Error: ${err.message}`);
    });

    this.consumer.on('processing_error', (err) => {
      this.logger.error(`SQS Processing Error: ${err.message}`);
    });

    this.consumer.start();
    this.logger.log(`SES SQS Consumer started listening on ${queueUrl}`);
  }

  onModuleDestroy() {
    if (this.consumer) {
      this.consumer.stop();
    }
  }

  private async processMessage(message: { Body?: string }) {
    if (!message.Body) return;

    let payload: SesEventPayload;
    try {
      payload = JSON.parse(message.Body) as SesEventPayload;
    } catch {
      this.logger.warn(`Invalid JSON in SES SQS body: ${message.Body}`);
      return;
    }

    const messageId = payload.mail?.messageId;
    if (!messageId) {
      this.logger.warn('SES event missing mail.messageId');
      return;
    }

    const eventType = payload.eventType ?? DEFAULT_EVENT_TYPE;
    const feedbackId = this.extractFeedbackId(payload);
    const destinations = Array.isArray(payload.mail?.destination)
      ? payload.mail?.destination ?? []
      : [];
    const mailTimestamp = this.parseTimestamp(payload.mail?.timestamp);
    const idempotencyKey = this.buildIdempotencyKey({
      messageId,
      eventType,
      feedbackId,
    });
    const now = new Date();

    try {
      await this.prisma.emailEvent.create({
        data: {
          idempotencyKey,
          messageId,
          eventType,
          source: payload.mail?.source ?? null,
          destinations,
          mailTimestamp,
          feedbackId: feedbackId ?? null,
          payload: payload as Prisma.InputJsonValue,
          lastSeenAt: now,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.prisma.emailEvent.update({
          where: { idempotencyKey },
          data: { lastSeenAt: now },
        });
        return;
      }
      throw error;
    }

    this.logger.log(
      `SES event recorded type=${eventType} messageId=${messageId} destination=${destinations[0] ?? 'n/a'}`,
    );

    if (eventType === 'Bounce') {
      await this.handleSuppression({
        payload,
        reason: EmailSuppressionReason.BOUNCE,
        messageId,
        feedbackId,
      });
      return;
    }

    if (eventType === 'Complaint') {
      await this.handleSuppression({
        payload,
        reason: EmailSuppressionReason.COMPLAINT,
        messageId,
        feedbackId,
      });
    }
  }

  private buildIdempotencyKey(params: {
    messageId: string;
    eventType: string;
    feedbackId?: string;
  }): string {
    const { messageId, eventType, feedbackId } = params;
    return [messageId, eventType, feedbackId ?? ''].join(':');
  }

  private extractFeedbackId(payload: SesEventPayload): string | undefined {
    return payload.bounce?.feedbackId ?? payload.complaint?.feedbackId;
  }

  private parseTimestamp(raw?: string): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private extractSuppressionTargets(payload: SesEventPayload): string[] {
    const recipients =
      payload.bounce?.bouncedRecipients ??
      payload.complaint?.complainedRecipients ??
      [];
    const emails = recipients
      .map((recipient) => normalizeEmail(recipient.emailAddress))
      .filter((email): email is string => Boolean(email));

    if (emails.length > 0) return emails;

    const fallback = Array.isArray(payload.mail?.destination)
      ? payload.mail?.destination
      : [];
    return fallback
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => Boolean(email));
  }

  private async handleSuppression(params: {
    payload: SesEventPayload;
    reason: EmailSuppressionReason;
    messageId: string;
    feedbackId?: string;
  }) {
    const { payload, reason, messageId, feedbackId } = params;
    const targets = this.extractSuppressionTargets(payload);
    if (targets.length === 0) {
      this.logger.warn(
        `SES ${reason.toLowerCase()} event missing recipients for messageId=${messageId}`,
      );
      return;
    }

    const detail =
      reason === EmailSuppressionReason.BOUNCE
        ? payload.bounce?.bounceType
        : payload.complaint?.complaintFeedbackType;

    this.logger.warn(
      `SES ${reason.toLowerCase()} suppression for ${targets.join(',')} messageId=${messageId} detail=${detail ?? 'n/a'}`,
    );

    await Promise.all(
      targets.map((email) =>
        this.upsertSuppression({ email, reason, messageId, feedbackId }),
      ),
    );
  }

  private async upsertSuppression(params: {
    email: string;
    reason: EmailSuppressionReason;
    messageId: string;
    feedbackId?: string;
  }) {
    const { email, reason, messageId, feedbackId } = params;
    const existing = await this.prisma.emailSuppression.findUnique({
      where: { email },
    });

    if (existing) {
      if (
        existing.reason === EmailSuppressionReason.COMPLAINT &&
        reason === EmailSuppressionReason.BOUNCE
      ) {
        return;
      }

      await this.prisma.emailSuppression.update({
        where: { email },
        data: {
          reason,
          sourceMessageId: messageId,
          feedbackId: feedbackId ?? null,
        },
      });
      return;
    }

    await this.prisma.emailSuppression.create({
      data: {
        email,
        reason,
        sourceMessageId: messageId,
        feedbackId: feedbackId ?? null,
      },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
