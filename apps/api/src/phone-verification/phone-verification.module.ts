// apps/api/src/phone-verification/phone-verification.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneVerificationDeliveryModule } from '../messaging/public-api';
import { IdentityChallengeModule } from '../auth/challenge-engine.module';
import { OtpChallengePolicyModule } from '../auth/otp-challenge-policy.module';
import { PhoneVerificationController } from './phone-verification.controller';
import { PhoneVerificationService } from './phone-verification.service';

@Module({
  imports: [
    PrismaModule,
    PhoneVerificationDeliveryModule,
    IdentityChallengeModule,
    OtpChallengePolicyModule,
  ],
  providers: [PhoneVerificationService],
  controllers: [PhoneVerificationController],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
