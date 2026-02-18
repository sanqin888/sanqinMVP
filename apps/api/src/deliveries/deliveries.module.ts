// apps/api/src/deliveries/deliveries.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UberDirectService } from './uber-direct.service';

@Module({
  imports: [HttpModule],
  providers: [UberDirectService],
  exports: [UberDirectService],
})
export class DeliveriesModule {}
