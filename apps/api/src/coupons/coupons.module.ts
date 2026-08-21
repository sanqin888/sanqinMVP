import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { CouponProgramClaimService } from './coupon-program-claim.service';
import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { CouponProgramSchedulerService } from './coupon-program-scheduler.service';
import { CouponProgramTriggerService } from './coupon-program-trigger.service';

@Global()
@Module({
  imports: [PrismaModule, NotificationModule],
  providers: [
    CouponProgramIssuerService,
    CouponProgramEligibilityService,
    CouponProgramClaimService,
    CouponProgramTriggerService,
    CouponProgramSchedulerService,
  ],
  exports: [
    CouponProgramIssuerService,
    CouponProgramEligibilityService,
    CouponProgramClaimService,
    CouponProgramTriggerService,
  ],
})
export class CouponsModule {}
