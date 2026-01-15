import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../sms.provider';

@Injectable()
export class LogSmsProvider implements SmsProvider {
  private readonly logger = new Logger(LogSmsProvider.name);

  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    this.logger.log(`[DEV] SMS to ${params.to}: ${params.body}`);
    return { ok: true };
  }
}
