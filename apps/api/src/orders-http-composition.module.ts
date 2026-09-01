import { Module } from '@nestjs/common';
import { OrdersController } from './orders/orders.controller';
import { OrdersModule } from './orders/public-api';
import { LegacyPosOrdersController } from './pos/legacy-pos-orders.controller';
import { PosDeviceModule } from './pos/public-api';

/**
 * Root HTTP composition for the shared /orders prefix.
 *
 * Legacy POS static routes must be registered before OrdersController's generic
 * /orders/:orderStableId route during the compatibility observation window.
 * The module owns only transport composition; Orders business implementation
 * remains inside OrdersModule and POS authentication remains inside POS.
 */
@Module({
  imports: [OrdersModule, PosDeviceModule],
  controllers: [LegacyPosOrdersController, OrdersController],
})
export class OrdersHttpCompositionModule {}
