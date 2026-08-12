import { Module } from '@nestjs/common';
import { UberEatsHttpModule } from './modules/ubereats-http.module';
import { UberEatsMenuModule } from './modules/menu.module';
import { UberEatsMerchantModule } from './modules/merchant.module';
import { UberEatsOperationsModule } from './modules/operations.module';
import { UberEatsOrdersModule } from './modules/orders.module';

/** HTTP composition root. Polling is enabled only by importing the worker module. */
@Module({
  imports: [
    UberEatsMerchantModule,
    UberEatsOrdersModule,
    UberEatsMenuModule,
    UberEatsOperationsModule,
    UberEatsHttpModule,
  ],
  exports: [
    UberEatsMerchantModule,
    UberEatsOrdersModule,
    UberEatsMenuModule,
    UberEatsOperationsModule,
  ],
})
export class UberEatsModule {}
