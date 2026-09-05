// apps/api/src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './orders-prisma';
import { OrdersController } from './orders.controller';
import { OrderEventsBus } from './order-events.bus';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/public-api';
import { BrandStoreConfigModule } from '../store/public-api';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/public-api';
import { PromotionsModule } from '../promotions/public-api';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';
import { NotificationProcessor } from './processors/notification.processor';
import { FulfillmentProcessor } from './processors/fulfillment.processor';
import { OrderLifecycleOutboxProcessor } from './processors/order-lifecycle-outbox.processor';
import { ScheduledOrderProcessor } from './processors/scheduled-order.processor';
import { PrintPosPayloadService } from './print-pos-payload.service';
import { ORDER_INGESTION } from './order-ingestion.contract';
import { ORDER_INGESTION_PROVIDER } from './order-ingestion.provider';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';
import { OrderLabelPlanService } from './order-label-plan.service';
import { POS_ORDER_READ } from './pos-order-read.contract';
import { PosOrderReadService } from './pos-order-read.service';
import { POS_ORDER_OPERATIONS } from './pos-order-operations.contract';
import { PosOrderOperationsService } from './pos-order-operations.service';
import { AdminMemberOrdersController } from './admin-member-orders.controller';
import { AdminMemberOrdersReadService } from './admin-member-orders-read.service';

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
  ],
  controllers: [OrdersController, AdminMemberOrdersController],
  providers: [
    OrderEventsBus,
    OrdersService,
    AdminMemberOrdersReadService,
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
    ORDER_INGESTION_PROVIDER,
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
    ORDER_INGESTION,
    OrderPreparationService,
    OrderSchedulingQueryService,
    PrintPosPayloadService,
  ],
})
export class OrdersModule {}
