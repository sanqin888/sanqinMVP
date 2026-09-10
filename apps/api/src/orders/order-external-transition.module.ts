import { Module } from '@nestjs/common';

import { ORDER_EXTERNAL_TRANSITION_COORDINATOR } from './order-external-transition.contract';
import { OrderExternalTransitionCoordinatorService } from './order-external-transition.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderExternalTransitionCoordinatorService,
    {
      provide: ORDER_EXTERNAL_TRANSITION_COORDINATOR,
      useExisting: OrderExternalTransitionCoordinatorService,
    },
  ],
  exports: [ORDER_EXTERNAL_TRANSITION_COORDINATOR],
})
export class OrderExternalTransitionModule {}
