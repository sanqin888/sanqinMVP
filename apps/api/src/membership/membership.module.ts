// apps/api/src/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { AuthModule } from '../auth/auth.module';
import { IdentityEmailVerificationModule } from '../auth/public-api';
import { MembershipService } from './membership.service';
import { CustomerService } from './customer.service';
import {
  MembershipController,
  MembershipPublicController,
} from './membership.controller';
import { NotificationModule } from '../notifications/public-api';
import { CouponsModule } from '../coupons/public-api';
import { CUSTOMER_ADMINISTRATION } from './customer-administration.contract';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    AuthModule,
    IdentityEmailVerificationModule,
    NotificationModule,
    CouponsModule,
  ],
  providers: [
    MembershipService,
    CustomerService,
    {
      provide: CUSTOMER_ADMINISTRATION,
      useExisting: CustomerService,
    },
  ],
  controllers: [MembershipController, MembershipPublicController],
  exports: [MembershipService, CUSTOMER_ADMINISTRATION],
})
export class MembershipModule {}
