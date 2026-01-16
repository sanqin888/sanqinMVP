import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import type {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../sms.provider';

@Injectable()
export class AwsSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AwsSmsProvider.name);

  constructor(private readonly httpService: HttpService) {}

  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    const accountSid = process.env.AWS_SMS_ACCOUNT_SID;
    const authToken = process.env.AWS_SMS_AUTH_TOKEN;
    const fromNumber = process.env.AWS_SMS_FROM_NUMBER;
    const messagingServiceSid = process.env.AWS_SMS_MESSAGING_SERVICE_SID;
    const apiUrl = process.env.AWS_SMS_API_URL;

    if (!accountSid || !authToken) {
      return { ok: false, error: 'aws credentials missing' };
    }

    if (!fromNumber && !messagingServiceSid) {
      return { ok: false, error: 'aws sender missing' };
    }

    if (!apiUrl) {
      return { ok: false, error: 'aws api url missing' };
    }

    const url = apiUrl.replace(
      '{accountSid}',
      encodeURIComponent(accountSid),
    );
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
        this.httpService.post<AwsMessageResponse>(url, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: accountSid, password: authToken },
        }),
      );
      const messageId = response.data.sid ?? undefined;
      return { ok: true, providerMessageId: messageId };
    } catch (error) {
      this.logger.error('AWS send failed', error as Error);
      return { ok: false, error: 'aws send failed' };
    }
  }
}

type AwsMessageResponse = {
  sid?: string;
};
