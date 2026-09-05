// apps/api/src/admin/members/admin-members.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoyaltyModule } from '../../loyalty/public-api';
import { MembershipModule } from '../../membership/public-api';
import { AdminMembersController } from './admin-members.controller';
import { AdminMembersService } from './admin-members.service';
import {
  AccountSecurityAdministrationModule,
  MemberRechargeVerificationModule,
} from '../../auth/public-api';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    MembershipModule,
    MemberRechargeVerificationModule,
    AccountSecurityAdministrationModule,
  ],
  controllers: [AdminMembersController],
  providers: [AdminMembersService],
})
export class AdminMembersModule {}
