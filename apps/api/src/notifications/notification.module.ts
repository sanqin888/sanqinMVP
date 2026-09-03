import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { MessagingModule } from '../messaging/messaging.module';
import {
  COUPON_ISSUED_NOTIFICATION,
} from './contracts/coupon-issued-notification.contract';
import { NotificationService } from './notification.service';

@Module({
  imports: [EmailModule, SmsModule, MessagingModule],
  providers: [
    NotificationService,
    {
      provide: COUPON_ISSUED_NOTIFICATION,
      useExisting: NotificationService,
    },
  ],
  exports: [NotificationService, COUPON_ISSUED_NOTIFICATION],
})
export class NotificationModule {}
