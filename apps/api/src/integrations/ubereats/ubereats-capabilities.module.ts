import { Module } from '@nestjs/common';
import {
  UBER_EATS_MENU_AVAILABILITY,
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
  UBER_EATS_STORE_STATUS_SYNC,
} from './public-api';
import { UberEatsMenuModule } from './modules/menu.module';
import { UberEatsMerchantModule } from './modules/merchant.module';
import { UberEatsOrdersModule } from './modules/orders.module';

/** Controller-free entry point for consumers of the stable integration API. */
@Module({
  imports: [
    UberEatsMerchantModule,
    UberEatsMenuModule,
    UberEatsOrdersModule,
  ],
  exports: [
    UBER_EATS_MENU_AVAILABILITY,
    UBER_EATS_ORDER_ACTIONS,
    UBER_EATS_ORDER_STATUS_SYNC,
    UBER_EATS_STORE_STATUS_SYNC,
  ],
})
export class UberEatsCapabilitiesModule {}
