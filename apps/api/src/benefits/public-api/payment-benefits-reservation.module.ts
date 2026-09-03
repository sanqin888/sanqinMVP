import { Module } from '@nestjs/common';

import { LoyaltyModule } from '../../loyalty/loyalty.module';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { MembershipModule } from '../../membership/membership.module';
import { MembershipService } from '../../membership/membership.service';
import {
  PAYMENT_COUPON_RESERVATION,
  PAYMENT_TENDER_RESERVATION,
} from '../contracts/payment-benefit-reservation.contract';

@Module({
  imports: [LoyaltyModule, MembershipModule],
  providers: [
    {
      provide: PAYMENT_TENDER_RESERVATION,
      useExisting: LoyaltyService,
    },
    {
      provide: PAYMENT_COUPON_RESERVATION,
      useExisting: MembershipService,
    },
  ],
  exports: [PAYMENT_TENDER_RESERVATION, PAYMENT_COUPON_RESERVATION],
})
export class PaymentBenefitsReservationModule {}
