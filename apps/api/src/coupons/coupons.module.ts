import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { CouponOfferPolicyService } from './coupon-offer-policy.service';
import {
  COUPON_OFFER_ADMIN,
  COUPON_OFFER_POLICY,
} from './coupon-offer-policy.contract';
import { CouponProgramClaimService } from './coupon-program-claim.service';
import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { CouponProgramSchedulerService } from './coupon-program-scheduler.service';
import { CouponProgramTriggerService } from './coupon-program-trigger.service';
import {
  COUPON_PROGRAM_ADMIN_ISSUER,
  COUPON_PROGRAM_CLAIMS,
  COUPON_PROGRAM_TRIGGER,
} from '../benefits/contracts/coupon-program.contract';

@Module({
  imports: [PrismaModule, NotificationModule],
  providers: [
    CouponOfferPolicyService,
    CouponProgramIssuerService,
    CouponProgramEligibilityService,
    CouponProgramClaimService,
    CouponProgramTriggerService,
    CouponProgramSchedulerService,
    {
      provide: COUPON_OFFER_POLICY,
      useExisting: CouponOfferPolicyService,
    },
    {
      provide: COUPON_OFFER_ADMIN,
      useExisting: CouponOfferPolicyService,
    },
    {
      provide: COUPON_PROGRAM_CLAIMS,
      useExisting: CouponProgramClaimService,
    },
    {
      provide: COUPON_PROGRAM_TRIGGER,
      useExisting: CouponProgramTriggerService,
    },
    {
      provide: COUPON_PROGRAM_ADMIN_ISSUER,
      useExisting: CouponProgramIssuerService,
    },
  ],
  exports: [
    COUPON_OFFER_POLICY,
    COUPON_OFFER_ADMIN,
    COUPON_PROGRAM_CLAIMS,
    COUPON_PROGRAM_TRIGGER,
    COUPON_PROGRAM_ADMIN_ISSUER,
  ],
})
export class CouponsModule {}
