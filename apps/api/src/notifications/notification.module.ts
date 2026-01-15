import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationService } from './notification.service';

@Module({
  imports: [EmailModule, SmsModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
