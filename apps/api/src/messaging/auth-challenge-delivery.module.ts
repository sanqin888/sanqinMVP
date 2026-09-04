import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { AuthChallengeDeliveryService } from './auth-challenge-delivery.service';
import { AUTH_CHALLENGE_DELIVERY } from './contracts/auth-challenge-delivery.contract';
import { MessagingModule } from './messaging.module';

@Module({
  imports: [EmailModule, SmsModule, MessagingModule],
  providers: [
    AuthChallengeDeliveryService,
    {
      provide: AUTH_CHALLENGE_DELIVERY,
      useExisting: AuthChallengeDeliveryService,
    },
  ],
  exports: [AUTH_CHALLENGE_DELIVERY],
})
export class AuthChallengeDeliveryModule {}
