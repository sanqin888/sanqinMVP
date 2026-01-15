import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsSendResult } from './sms.provider';
import { SMS_PROVIDER_TOKEN } from './sms.tokens';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly defaultCountryCode =
    process.env.SMS_DEFAULT_COUNTRY_CODE?.replace(/\D+/g, '') ?? '1';

  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly provider: SmsProvider,
  ) {}

  async sendSms(params: {
    phone: string;
    body: string;
  }): Promise<SmsSendResult> {
    const formatted = this.formatPhoneNumber(params.phone);
    if (!formatted) {
      return { ok: false, error: 'invalid phone number' };
    }
    const result = await this.provider.sendSms({
      to: formatted,
      body: params.body,
    });
    if (!result.ok) {
      this.logger.warn(`SMS send failed: ${result.error ?? 'unknown'}`);
    }
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
}
