import { Module } from '@nestjs/common';

import { EmailVerificationDeliveryModule } from '../email/public-api';
import { IdentityChallengeModule } from './challenge-engine.module';
import { PrismaModule } from './identity-prisma';
import { EmailCheckoutVerificationController } from './email-checkout-verification.controller';
import { IDENTITY_EMAIL_VERIFICATION } from './email-verification.port';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [PrismaModule, IdentityChallengeModule, EmailVerificationDeliveryModule],
  controllers: [EmailCheckoutVerificationController],
  providers: [
    EmailVerificationService,
    {
      provide: IDENTITY_EMAIL_VERIFICATION,
      useExisting: EmailVerificationService,
    },
  ],
  exports: [IDENTITY_EMAIL_VERIFICATION],
})
export class IdentityEmailVerificationModule {}
