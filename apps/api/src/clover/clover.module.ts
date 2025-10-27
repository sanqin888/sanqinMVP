import { Module } from '@nestjs/common';
import { CloverService } from './clover.service';
import { CloverController } from './clover.controller';
import { CloverPayController } from './clover-pay.controller';

@Module({
  providers: [CloverService],
  controllers: [CloverController, CloverPayController],
  exports: [CloverService],
})
export class CloverModule {}
