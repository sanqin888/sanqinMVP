// apps/api/src/admin/members/admin-members.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoyaltyModule } from '../../loyalty/public-api';
import { MembershipModule } from '../../membership/membership.module';
import { PhoneVerificationModule } from '../../phone-verification/phone-verification.module';
import { MemberRechargeEmailDeliveryModule } from '../../email/public-api';
import { AdminMembersController } from './admin-members.controller';
import { AdminMembersService } from './admin-members.service';
import { IdentityChallengeModule } from '../../auth/public-api';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    MembershipModule,
    PhoneVerificationModule,
    MemberRechargeEmailDeliveryModule,
    IdentityChallengeModule,
  ],
  controllers: [AdminMembersController],
  providers: [AdminMembersService],
})
export class AdminMembersModule {}
