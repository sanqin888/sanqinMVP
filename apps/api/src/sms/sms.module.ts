//apps/api/src/sms/sms.module.ts
import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SMS_PROVIDER_TOKEN } from './sms.tokens';
import { AwsSmsProvider } from './providers/aws-sms.provider';
import { LogSmsProvider } from './providers/log-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import type { SmsProvider } from './sms.provider';
import { TwilioWebhooksController } from './sms/webhooks/twilio.webhooks.controller';

@Module({
  controllers: [TwilioWebhooksController],
  providers: [
    SmsService,
    AwsSmsProvider,
    TwilioSmsProvider,
    LogSmsProvider,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (
        aws: AwsSmsProvider,
        twilioProvider: TwilioSmsProvider,
        loggerProvider: LogSmsProvider,
      ): SmsProvider => {
        const provider = process.env.SMS_PROVIDER?.trim().toLowerCase();

        if (provider === 'aws') return aws;
        if (provider === 'twilio') return twilioProvider;

        return loggerProvider;
      },
      inject: [AwsSmsProvider, TwilioSmsProvider, LogSmsProvider],
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
