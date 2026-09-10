import { Module } from '@nestjs/common';

import { ORDER_EXTERNAL_CANCELLATION_FINALIZER } from './order-external-cancellation.contract';
import { OrderExternalCancellationFinalizerService } from './order-external-cancellation.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderExternalCancellationFinalizerService,
    {
      provide: ORDER_EXTERNAL_CANCELLATION_FINALIZER,
      useExisting: OrderExternalCancellationFinalizerService,
    },
  ],
  exports: [ORDER_EXTERNAL_CANCELLATION_FINALIZER],
})
export class OrderExternalCancellationModule {}
