// apps/api/src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/public-api';
import { BrandStoreConfigModule } from '../store/public-api';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/membership.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationProcessor } from './processors/notification.processor';
import { FulfillmentProcessor } from './processors/fulfillment.processor';
import { OrderLifecycleOutboxProcessor } from './processors/order-lifecycle-outbox.processor';
import { ScheduledOrderProcessor } from './processors/scheduled-order.processor';
import { PrintPosPayloadService } from './print-pos-payload.service';
import { OrderIngestionService } from './order-ingestion.service';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';
import { OrderLabelPlanService } from './order-label-plan.service';
import { POS_ORDER_READ } from './pos-order-read.contract';
import { PosOrderReadService } from './pos-order-read.service';
import { POS_ORDER_OPERATIONS } from './pos-order-operations.contract';
import { PosOrderOperationsService } from './pos-order-operations.service';

@Module({
  imports: [
    PrismaModule,
    LoyaltyModule,
    BrandStoreConfigModule,
    DeliveriesModule,
    MembershipModule,
    PromotionsModule,
    LocationModule,
    NotificationModule,
    EmailModule,
    MessagingModule,
  ],
  providers: [
    OrdersService,
    PosOrderReadService,
    {
      provide: POS_ORDER_READ,
      useExisting: PosOrderReadService,
    },
    PosOrderOperationsService,
    {
      provide: POS_ORDER_OPERATIONS,
      useExisting: PosOrderOperationsService,
    },
    OrderIngestionService,
    OrderPreparationService,
    OrderSchedulingQueryService,
    PrintPosPayloadService,
    OrderLabelPlanService,
    NotificationProcessor,
    FulfillmentProcessor,
    OrderLifecycleOutboxProcessor,
    ScheduledOrderProcessor,
  ],
  exports: [
    OrdersService,
    POS_ORDER_READ,
    POS_ORDER_OPERATIONS,
    OrderIngestionService,
    OrderPreparationService,
    OrderSchedulingQueryService,
    PrintPosPayloadService,
  ],
})
export class OrdersModule {}
