import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { CouponProgramSchedulerService } from './coupon-program-scheduler.service';
import { CouponProgramTriggerService } from './coupon-program-trigger.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    CouponProgramIssuerService,
    CouponProgramTriggerService,
    CouponProgramSchedulerService,
  ],
  exports: [CouponProgramIssuerService, CouponProgramTriggerService],
})
export class CouponsModule {}
