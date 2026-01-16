import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SMS_PROVIDER_TOKEN } from './sms.tokens';
import { AwsSmsProvider } from './providers/aws-sms.provider';
import { LogSmsProvider } from './providers/log-sms.provider';
import type { SmsProvider } from './sms.provider';

@Module({
  providers: [
    SmsService,
    AwsSmsProvider,
    LogSmsProvider,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (
        aws: AwsSmsProvider,
        loggerProvider: LogSmsProvider,
      ): SmsProvider => {
        const provider = process.env.SMS_PROVIDER?.toLowerCase();
        if (provider === 'aws') {
          return aws;
        }
        return loggerProvider;
      },
      inject: [AwsSmsProvider, LogSmsProvider],
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
