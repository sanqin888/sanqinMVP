// apps/api/src/deliveries/deliveries.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UBER_DIRECT_DELIVERY_DISPATCHER } from './uber-direct-dispatch.contract';
import { UberDirectService } from './uber-direct.service';

@Module({
  imports: [HttpModule],
  providers: [
    UberDirectService,
    {
      provide: UBER_DIRECT_DELIVERY_DISPATCHER,
      useExisting: UberDirectService,
    },
  ],
  exports: [UBER_DIRECT_DELIVERY_DISPATCHER],
})
export class DeliveriesModule {}
