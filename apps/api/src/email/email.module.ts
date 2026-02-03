//apps/api/src/email/email.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';
import { EMAIL_PROVIDER_TOKEN } from './email.tokens';
import { SesEmailProvider } from './providers/ses-email.provider';
import { LogEmailProvider } from './providers/log-email.provider';
import { SendGridEmailProvider } from './providers/sendgrid-email.provider';
import { SesEventProcessor } from './ses-event.processor';
import type { EmailProvider } from './email.provider';
import { SendGridEmailWebhookController } from './webhook/sendgrid-email.webhook.controller';
import { SendGridEmailWebhookService } from './webhook/sendgrid-email.webhook.service';
import { SendGridEmailWebhookVerifier } from './webhook/sendgrid-email.webhook.verifier';

@Module({
  imports: [HttpModule, PrismaModule, MessagingModule],
  controllers: [SendGridEmailWebhookController],
  providers: [
    EmailService,
    EmailVerificationService,
    SesEmailProvider,
    SendGridEmailProvider,
    LogEmailProvider,
    SesEventProcessor,
    SendGridEmailWebhookService,
    SendGridEmailWebhookVerifier,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (
        sesProvider: SesEmailProvider,
        sendgridProvider: SendGridEmailProvider,
        logProvider: LogEmailProvider,
      ): EmailProvider => {
        const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

        if (provider === 'ses') return sesProvider;
        if (provider === 'sendgrid') return sendgridProvider;

        return logProvider;
      },
      inject: [SesEmailProvider, SendGridEmailProvider, LogEmailProvider],
    },
  ],
  exports: [EmailService, EmailVerificationService],
})
export class EmailModule {}
