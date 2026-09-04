import { Module } from '@nestjs/common';

import { MEMBER_RECHARGE_EMAIL_DELIVERY } from './contracts/member-recharge-email-delivery.contract';
import { EmailModule } from './email.module';
import { MemberRechargeEmailDeliveryService } from './member-recharge-email-delivery.service';

@Module({
  imports: [EmailModule],
  providers: [
    MemberRechargeEmailDeliveryService,
    {
      provide: MEMBER_RECHARGE_EMAIL_DELIVERY,
      useExisting: MemberRechargeEmailDeliveryService,
    },
  ],
  exports: [MEMBER_RECHARGE_EMAIL_DELIVERY],
})
export class MemberRechargeEmailDeliveryModule {}
