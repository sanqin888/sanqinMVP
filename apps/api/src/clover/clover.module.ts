import { Module } from '@nestjs/common';
import { CloverService } from './clover.service';
import { CloverController } from './clover.controller';

@Module({
  providers: [CloverService],
  controllers: [CloverController],
  exports: [CloverService],
})
export class CloverModule {}
