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
        // 获取原始值
        const rawValue = process.env.SMS_PROVIDER;

        // .trim() 去除首尾空格/换行符
        const provider = rawValue?.trim().toLowerCase();

        if (provider === 'aws') {
          console.log('[System Check] ✅ Switching to AWS Provider');
          return aws;
        }

        console.log(
          '[System Check] ⚠️ Fallback to Log Provider (Conditions not met)',
        );
        return loggerProvider;
      },
      inject: [AwsSmsProvider, LogSmsProvider],
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
