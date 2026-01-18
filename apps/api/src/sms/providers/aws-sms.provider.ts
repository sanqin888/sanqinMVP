//apps/api/src/sms/providers/aws-sms.provider.ts
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

  // 确保这里读取了正确的 Region
  private readonly client = new PinpointSMSVoiceV2Client({
    region: process.env.AWS_REGION ?? 'ca-central-1',
  });

  async sendSms(params: SmsSendParams): Promise<SmsSendResult> {
    const originationIdentity = process.env.AWS_SMS_ORIGINATION_IDENTITY;
    if (!originationIdentity) {
      return { ok: false, error: 'aws origination identity missing' };
    }

    // 自动补全 E.164 格式的 '+' 号
    let destination = params.to;
    if (!destination.startsWith('+')) {
      destination = `+${destination}`;
    }

    // 建议加一行日志，确保你看到最终发给 AWS 的号码是对的
    this.logger.log(`[AWS Sending] To: ${destination}, Body: ${params.body}`);

    try {
      const out = await this.client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: destination, // 使用处理后的号码
          OriginationIdentity: originationIdentity,
          MessageBody: params.body,
          MessageType: 'TRANSACTIONAL',
          // 如果没有配置 Set Name，不要传 undefined，某些 SDK 版本可能会报错
          ...(process.env.AWS_SMS_CONFIGURATION_SET_NAME
            ? { ConfigurationSetName: process.env.AWS_SMS_CONFIGURATION_SET_NAME }
            : {}),
        }),
      );

      return { ok: true, providerMessageId: out.MessageId };
    } catch (e) {
      this.logger.error('AWS send failed', e as Error);
      return { ok: false, error: 'aws send failed' };
    }
  }
}