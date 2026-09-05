//apps/api/src/loyalty/loyalty.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { CouponsModule } from '../coupons/public-api';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { LOYALTY_ORDER_PAID_SETTLEMENT } from './loyalty-order-paid-settlement.contract';
import {
  LOYALTY_POLICY_READER,
  LOYALTY_POLICY_SETTINGS_READER,
  LOYALTY_POLICY_WRITER,
} from './loyalty-policy.contract';
import { PrismaLoyaltyPolicyWriter } from './loyalty-policy-prisma.writer';

@Module({
  imports: [PrismaModule, PosDeviceModule, CouponsModule],
  providers: [
    LoyaltyService,
    PrismaLoyaltyPolicyWriter,
    {
      provide: LOYALTY_ORDER_PAID_SETTLEMENT,
      useExisting: LoyaltyService,
    },
    {
      provide: LOYALTY_POLICY_READER,
      useExisting: LoyaltyService,
    },
    {
      provide: LOYALTY_POLICY_SETTINGS_READER,
      useExisting: PrismaLoyaltyPolicyWriter,
    },
    {
      provide: LOYALTY_POLICY_WRITER,
      useExisting: PrismaLoyaltyPolicyWriter,
    },
  ],
  controllers: [LoyaltyController],
  exports: [
    LoyaltyService,
    LOYALTY_ORDER_PAID_SETTLEMENT,
    LOYALTY_POLICY_READER,
    LOYALTY_POLICY_SETTINGS_READER,
    LOYALTY_POLICY_WRITER,
  ],
})
export class LoyaltyModule {}
