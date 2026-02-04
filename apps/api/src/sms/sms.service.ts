import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MessagingChannel,
  MessagingProvider,
  MessagingSendStatus,
  SuppressionReason,
  UserLanguage,
} from '@prisma/client';
import type { SmsProvider, SmsSendResult } from './sms.provider';
import { SMS_PROVIDER_TOKEN } from './sms.tokens';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly defaultCountryCode =
    process.env.SMS_DEFAULT_COUNTRY_CODE?.replace(/\D+/g, '') ?? '1';

  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly provider: SmsProvider,
    private readonly prisma: PrismaService,
  ) {}

  async sendSms(params: {
    phone: string;
    body: string;
    templateType?: string;
    templateVersion?: string;
    locale?: string;
    userId?: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<SmsSendResult> {
    const formatted = this.formatPhoneNumber(params.phone);
    if (!formatted) {
      await this.recordFailedSend({
        phone: params.phone,
        body: params.body,
        errorCode: 'INVALID_RECIPIENT',
        errorMessage: 'invalid phone number',
        templateType: params.templateType,
        templateVersion: params.templateVersion,
        locale: params.locale,
        userId: params.userId,
        metadata: params.metadata,
      });
      return { ok: false, error: 'invalid phone number' };
    }

    const sendRecord = await this.prisma.messagingSend.create({
      data: {
        channel: MessagingChannel.SMS,
        provider: this.resolveProvider(),
        toAddressNorm: formatted,
        toAddressRaw: params.phone,
        templateType: params.templateType ?? 'CUSTOM',
        templateVersion: params.templateVersion ?? null,
        locale: params.locale ? this.resolveLanguageEnum(params.locale) : null,
        userId: params.userId ?? null,
        statusLatest: MessagingSendStatus.QUEUED,
        metadata: this.buildSendMetadata({
          base: params.metadata,
          body: params.body,
        }),
      },
    });

    const suppression = await this.checkSuppression(formatted);
    if (suppression.suppressed) {
      await this.prisma.messagingSend.update({
        where: { id: sendRecord.id },
        data: {
          statusLatest: MessagingSendStatus.FAILED,
          errorCodeLatest: 'SUPPRESSED',
          errorMessageLatest: suppression.reason ?? null,
        },
      });
      this.logger.warn(
        `SMS suppressed for ${formatted} reason=${suppression.reason ?? 'unknown'}`,
      );
      return { ok: false, error: 'suppressed' };
    }

    const result = await this.provider.sendSms({
      to: formatted,
      body: params.body,
    });
    if (result.ok) {
      await this.prisma.messagingSend.update({
        where: { id: sendRecord.id },
        data: {
          statusLatest: MessagingSendStatus.SENT,
          providerMessageId: result.providerMessageId ?? null,
        },
      });
      return result;
    }

    await this.prisma.messagingSend.update({
      where: { id: sendRecord.id },
      data: {
        statusLatest: MessagingSendStatus.FAILED,
        errorCodeLatest: result.error ? 'PROVIDER_ERROR' : null,
        errorMessageLatest: result.error ?? null,
      },
    });
    this.logger.warn(`SMS send failed: ${result.error ?? 'unknown'}`);
    return result;
  }

  private formatPhoneNumber(raw: string): string | null {
    const trimmed = raw?.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('+')) return trimmed;
    const digits = trimmed.replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
      return `+${this.defaultCountryCode}${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    return `+${digits}`;
  }

  private resolveProvider(): MessagingProvider {
    const provider = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
    if (provider === 'aws') return MessagingProvider.AWS_SMS;
    if (provider === 'twilio') return MessagingProvider.TWILIO;
    return MessagingProvider.MANUAL;
  }

  private resolveLanguageEnum(locale: string): UserLanguage {
    return locale.toLowerCase().startsWith('zh')
      ? UserLanguage.ZH
      : UserLanguage.EN;
  }

  private buildSendMetadata(params: {
    base?: Record<string, unknown> | null;
    body: string;
  }): Record<string, unknown> {
    const preview =
      params.body.length > 200 ? `${params.body.slice(0, 200)}…` : params.body;
    return {
      ...(params.base ?? {}),
      bodyPreview: preview,
      bodyLength: params.body.length,
    };
  }

  private async checkSuppression(
    addressNorm: string,
  ): Promise<{ suppressed: boolean; reason?: SuppressionReason }> {
    const suppression = await this.prisma.messagingSuppression.findFirst({
      where: {
        channel: MessagingChannel.SMS,
        addressNorm,
        liftedAt: null,
      },
    });
    if (!suppression) return { suppressed: false };
    return { suppressed: true, reason: suppression.reason };
  }

  private async recordFailedSend(params: {
    phone: string;
    body: string;
    errorCode: string;
    errorMessage: string;
    templateType?: string;
    templateVersion?: string;
    locale?: string;
    userId?: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const toAddressNorm = params.phone.trim() || 'unknown';
    await this.prisma.messagingSend.create({
      data: {
        channel: MessagingChannel.SMS,
        provider: this.resolveProvider(),
        toAddressNorm,
        toAddressRaw: params.phone,
        templateType: params.templateType ?? 'CUSTOM',
        templateVersion: params.templateVersion ?? null,
        locale: params.locale ? this.resolveLanguageEnum(params.locale) : null,
        userId: params.userId ?? null,
        statusLatest: MessagingSendStatus.FAILED,
        errorCodeLatest: params.errorCode,
        errorMessageLatest: params.errorMessage,
        metadata: this.buildSendMetadata({
          base: params.metadata,
          body: params.body,
        }),
      },
    });
  }
}
