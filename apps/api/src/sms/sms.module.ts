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
        // 1. 获取原始值
        const rawValue = process.env.SMS_PROVIDER;
        
        // 2. 打印调试信息（用引号包围，看看到底有没有空格）
        console.log(`[System Check] SMS_PROVIDER from env: "${rawValue}"`);

        // 3. 关键修复：增加 .trim() 去除首尾空格/换行符
        const provider = rawValue?.trim().toLowerCase();

        if (provider === 'aws') {
          console.log('[System Check] ✅ Switching to AWS Provider');
          return aws;
        }

        console.log('[System Check] ⚠️ Fallback to Log Provider (Conditions not met)');
        return loggerProvider;
      },
      inject: [AwsSmsProvider, LogSmsProvider],
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
