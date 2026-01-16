import { Injectable, Logger } from '@nestjs/common';
import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import type {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../sms.provider';

@Injectable()
export class AwsSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AwsSmsProvider.name);

  private readonly client = new PinpointSMSVoiceV2Client({
    region: process.env.AWS_REGION ?? 'ca-central-1',
  });

  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    const originationIdentity = process.env.AWS_SMS_ORIGINATION_IDENTITY;
    if (!originationIdentity) {
      return { ok: false, error: 'aws origination identity missing' };
    }

    try {
      const out = await this.client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: params.to, // E.164: +1...
          OriginationIdentity: originationIdentity,
          MessageBody: params.body,
          MessageType: 'TRANSACTIONAL', // OTP 必须走 TRANSACTIONAL
          ConfigurationSetName: process.env.AWS_SMS_CONFIGURATION_SET_NAME,
        }),
      );

      return { ok: true, providerMessageId: out.MessageId };
    } catch (e) {
      this.logger.error('AWS send failed', e as Error);
      return { ok: false, error: 'aws send failed' };
    }
  }
}
