import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import type {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../sms.provider';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private readonly httpService: HttpService) {}

  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken) {
      return { ok: false, error: 'twilio credentials missing' };
    }

    if (!fromNumber && !messagingServiceSid) {
      return { ok: false, error: 'twilio sender missing' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: params.to,
      Body: params.body,
    });

    if (messagingServiceSid) {
      body.set('MessagingServiceSid', messagingServiceSid);
    } else if (fromNumber) {
      body.set('From', fromNumber);
    }

    try {
      const response = await lastValueFrom(
        this.httpService.post<TwilioMessageResponse>(url, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: accountSid, password: authToken },
        }),
      );
      const messageId = response.data.sid ?? undefined;
      return { ok: true, providerMessageId: messageId };
    } catch (error) {
      this.logger.error('Twilio send failed', error as Error);
      return { ok: false, error: 'twilio send failed' };
    }
  }
}

type TwilioMessageResponse = {
  sid?: string;
};
