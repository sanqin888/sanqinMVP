import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';
import { EMAIL_PROVIDER_TOKEN } from './email.tokens';
import { SesEmailProvider } from './providers/ses-email.provider';
import { LogEmailProvider } from './providers/log-email.provider';
import type { EmailProvider } from './email.provider';

@Module({
  imports: [HttpModule, PrismaModule, MessagingModule],
  providers: [
    EmailService,
    EmailVerificationService,
    SesEmailProvider,
    LogEmailProvider,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (
        sesProvider: SesEmailProvider,
        logProvider: LogEmailProvider,
      ): EmailProvider => {
        const provider = process.env.EMAIL_PROVIDER?.toLowerCase();
        if (provider === 'ses') {
          return sesProvider;
        }
        return logProvider;
      },
      inject: [SesEmailProvider, LogEmailProvider],
    },
  ],
  exports: [EmailService, EmailVerificationService],
})
export class EmailModule {}
