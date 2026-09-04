import { Module } from '@nestjs/common';

import { STAFF_INVITE_DELIVERY } from './contracts/staff-invite-delivery.contract';
import { EmailModule } from './email.module';
import { StaffInviteDeliveryService } from './staff-invite-delivery.service';

@Module({
  imports: [EmailModule],
  providers: [
    StaffInviteDeliveryService,
    {
      provide: STAFF_INVITE_DELIVERY,
      useExisting: StaffInviteDeliveryService,
    },
  ],
  exports: [STAFF_INVITE_DELIVERY],
})
export class StaffInviteDeliveryModule {}
