//apps/api/src/sms/providers/twilio-sms.provider.ts
import { Injectable } from '@nestjs/common';
import twilio from 'twilio';
import type {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../sms.provider';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

    // 二选一：from number 或 messaging service sid
    const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
    const messagingServiceSid =
      process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

    if (!accountSid || !authToken) {
      return {
        ok: false,
        error: 'missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN',
      };
    }
    if (!fromNumber && !messagingServiceSid) {
      return {
        ok: false,
        error: 'missing TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID',
      };
    }

    try {
      const createClient = twilio as TwilioFactory;
      const client = createClient(accountSid, authToken);
      const message = await client.messages.create({
        to: params.to,
        body: params.body,
        ...(messagingServiceSid
          ? { messagingServiceSid }
          : { from: fromNumber }),
      });

      return { ok: true, providerMessageId: message.sid };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}

type TwilioMessageCreateParams = {
  to: string;
  body: string;
  from?: string;
  messagingServiceSid?: string;
};

type TwilioMessage = {
  sid: string;
};

type TwilioMessagesClient = {
  create: (params: TwilioMessageCreateParams) => Promise<TwilioMessage>;
};

type TwilioClient = {
  messages: TwilioMessagesClient;
};

type TwilioFactory = (accountSid: string, authToken: string) => TwilioClient;
