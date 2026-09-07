import { Module } from '@nestjs/common';

import { LoyaltyModule } from '../../loyalty/loyalty.module';
import { MembershipModule } from '../../membership/membership.module';
import { ORDER_BENEFITS_READER } from '../contracts/order-benefits-read.contract';
import { OrderBenefitsReadService } from '../order-benefits-read.service';

@Module({
  imports: [LoyaltyModule, MembershipModule],
  providers: [
    OrderBenefitsReadService,
    {
      provide: ORDER_BENEFITS_READER,
      useExisting: OrderBenefitsReadService,
    },
  ],
  exports: [ORDER_BENEFITS_READER],
})
export class OrderBenefitsReadModule {}
