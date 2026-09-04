import { Module } from '@nestjs/common';

import {
  EMAIL_VERIFICATION_DELIVERY,
} from './contracts/email-verification-delivery.contract';
import { EmailModule } from './email.module';
import { EmailService } from './email.service';

@Module({
  imports: [EmailModule],
  providers: [
    {
      provide: EMAIL_VERIFICATION_DELIVERY,
      useExisting: EmailService,
    },
  ],
  exports: [EMAIL_VERIFICATION_DELIVERY],
})
export class EmailVerificationDeliveryModule {}
