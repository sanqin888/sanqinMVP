import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SmsService } from './sms.service';
import { SMS_PROVIDER_TOKEN } from './sms.tokens';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { LogSmsProvider } from './providers/log-sms.provider';
import type { SmsProvider } from './sms.provider';

@Module({
  imports: [HttpModule],
  providers: [
    SmsService,
    TwilioSmsProvider,
    LogSmsProvider,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (
        twilio: TwilioSmsProvider,
        loggerProvider: LogSmsProvider,
      ): SmsProvider => {
        const provider = process.env.SMS_PROVIDER?.toLowerCase();
        if (provider === 'twilio') {
          return twilio;
        }
        return loggerProvider;
      },
      inject: [TwilioSmsProvider, LogSmsProvider],
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
