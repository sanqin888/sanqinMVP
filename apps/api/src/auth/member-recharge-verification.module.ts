import { Module } from '@nestjs/common';

import { MemberRechargeEmailDeliveryModule } from '../email/public-api';
import { PhoneVerificationDeliveryModule } from '../messaging/public-api';
import { IdentityChallengeModule } from './challenge-engine.module';
import { PrismaModule } from './identity-prisma';
import { OtpChallengePolicyModule } from './otp-challenge-policy.module';
import { MEMBER_RECHARGE_VERIFICATION } from './member-recharge-verification.contract';
import { MemberRechargeVerificationService } from './member-recharge-verification.service';

@Module({
  imports: [
    PrismaModule,
    IdentityChallengeModule,
    OtpChallengePolicyModule,
    PhoneVerificationDeliveryModule,
    MemberRechargeEmailDeliveryModule,
  ],
  providers: [
    MemberRechargeVerificationService,
    {
      provide: MEMBER_RECHARGE_VERIFICATION,
      useExisting: MemberRechargeVerificationService,
    },
  ],
  exports: [MEMBER_RECHARGE_VERIFICATION],
})
export class MemberRechargeVerificationModule {}
