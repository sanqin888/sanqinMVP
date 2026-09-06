import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { MessagingModule } from '../messaging/messaging.module';
import { COUPON_ISSUED_NOTIFICATION } from './contracts/coupon-issued-notification.contract';
import { CUSTOMER_LIFECYCLE_NOTIFICATION } from './contracts/customer-lifecycle-notification.contract';
import { DELIVERY_DISPATCH_FAILURE_NOTIFICATION } from './contracts/delivery-dispatch-failure-notification.contract';
import { ORDER_INVOICE_DELIVERY } from './contracts/order-invoice-delivery.contract';
import { ORDER_READY_NOTIFICATION } from './contracts/order-ready-notification.contract';
import { NotificationService } from './notification.service';

@Module({
  imports: [EmailModule, SmsModule, MessagingModule],
  providers: [
    NotificationService,
    {
      provide: COUPON_ISSUED_NOTIFICATION,
      useExisting: NotificationService,
    },
    {
      provide: CUSTOMER_LIFECYCLE_NOTIFICATION,
      useExisting: NotificationService,
    },
    {
      provide: DELIVERY_DISPATCH_FAILURE_NOTIFICATION,
      useExisting: NotificationService,
    },
    {
      provide: ORDER_INVOICE_DELIVERY,
      useExisting: NotificationService,
    },
    {
      provide: ORDER_READY_NOTIFICATION,
      useExisting: NotificationService,
    },
  ],
  exports: [
    NotificationService,
    COUPON_ISSUED_NOTIFICATION,
    CUSTOMER_LIFECYCLE_NOTIFICATION,
    DELIVERY_DISPATCH_FAILURE_NOTIFICATION,
    ORDER_INVOICE_DELIVERY,
    ORDER_READY_NOTIFICATION,
  ],
})
export class NotificationModule {}
