import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationService } from './notification.service';

@Module({
  imports: [EmailModule, SmsModule, MessagingModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
