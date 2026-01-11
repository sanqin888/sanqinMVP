// apps/api/src/admin/members/admin-members.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoyaltyModule } from '../../loyalty/loyalty.module';
import { MembershipModule } from '../../membership/membership.module';
import { PhoneVerificationModule } from '../../phone-verification/phone-verification.module';
import { AdminMembersController } from './admin-members.controller';
import { AdminMembersService } from './admin-members.service';

@Module({
  imports: [PrismaModule, LoyaltyModule, MembershipModule, PhoneVerificationModule],
  controllers: [AdminMembersController],
  providers: [AdminMembersService],
})
export class AdminMembersModule {}
