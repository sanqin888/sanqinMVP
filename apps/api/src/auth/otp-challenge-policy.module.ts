import { Module } from '@nestjs/common';

import { IdentityChallengeModule } from './challenge-engine.module';
import { PrismaModule } from './identity-prisma';
import { OtpChallengePolicyService } from './otp-challenge-policy.service';

@Module({
  imports: [PrismaModule, IdentityChallengeModule],
  providers: [OtpChallengePolicyService],
  exports: [OtpChallengePolicyService],
})
export class OtpChallengePolicyModule {}
