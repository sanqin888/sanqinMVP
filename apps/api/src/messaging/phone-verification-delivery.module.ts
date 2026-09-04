import { Module } from '@nestjs/common';

import { SmsModule } from '../sms/sms.module';
import { MessagingModule } from './messaging.module';
import { PHONE_VERIFICATION_DELIVERY } from './contracts/phone-verification-delivery.contract';
import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';

@Module({
  imports: [SmsModule, MessagingModule],
  providers: [
    PhoneVerificationDeliveryService,
    {
      provide: PHONE_VERIFICATION_DELIVERY,
      useExisting: PhoneVerificationDeliveryService,
    },
  ],
  exports: [PHONE_VERIFICATION_DELIVERY],
})
export class PhoneVerificationDeliveryModule {}
