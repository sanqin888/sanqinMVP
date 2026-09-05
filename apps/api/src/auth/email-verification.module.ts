import { Module } from '@nestjs/common';

import { EmailVerificationDeliveryModule } from '../email/public-api';
import { IdentityChallengeModule } from './challenge-engine.module';
import { PrismaModule } from './identity-prisma';
import { OtpChallengePolicyModule } from './otp-challenge-policy.module';
import { EmailCheckoutVerificationController } from './email-checkout-verification.controller';
import { IDENTITY_EMAIL_VERIFICATION } from './email-verification.port';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [
    PrismaModule,
    IdentityChallengeModule,
    OtpChallengePolicyModule,
    EmailVerificationDeliveryModule,
  ],
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
