// apps/api/src/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { MembershipService } from './membership.service';
import { MembershipController } from './membership.controller';
import { NotificationModule } from '../notifications/notification.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    AuthModule,
    EmailModule,
    NotificationModule,
    CouponsModule,
  ],
  providers: [MembershipService],
  controllers: [MembershipController],
  exports: [MembershipService],
})
export class MembershipModule {}
