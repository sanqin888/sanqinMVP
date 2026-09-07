// apps/api/src/membership/membership.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './membership-prisma';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { AuthModule } from '../auth/auth.module';
import {
  AccountSecurityAdministrationModule,
  IdentityEmailVerificationModule,
} from '../auth/public-api';
import { MembershipService } from './membership.service';
import { CustomerService } from './customer.service';
import { CustomerExistenceService } from './customer-existence.service';
import {
  MembershipController,
  MembershipPublicController,
} from './membership.controller';
import { NotificationModule } from '../notifications/public-api';
import { CouponsModule } from '../coupons/public-api';
import { CUSTOMER_ADMINISTRATION } from './customer-administration.contract';
import { CUSTOMER_EXISTENCE_READER } from './customer-existence.contract';
import { CUSTOMER_ORDER_CONTEXT_READER } from './customer-order-context.contract';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    AuthModule,
    AccountSecurityAdministrationModule,
    IdentityEmailVerificationModule,
    NotificationModule,
    CouponsModule,
  ],
  providers: [
    MembershipService,
    CustomerService,
    CustomerExistenceService,
    {
      provide: CUSTOMER_ADMINISTRATION,
      useExisting: CustomerService,
    },
    {
      provide: CUSTOMER_EXISTENCE_READER,
      useExisting: CustomerExistenceService,
    },
    {
      provide: CUSTOMER_ORDER_CONTEXT_READER,
      useExisting: CustomerService,
    },
  ],
  controllers: [MembershipController, MembershipPublicController],
  exports: [
    MembershipService,
    CUSTOMER_ADMINISTRATION,
    CUSTOMER_EXISTENCE_READER,
    CUSTOMER_ORDER_CONTEXT_READER,
  ],
})
export class MembershipModule {}
