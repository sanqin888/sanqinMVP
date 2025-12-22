import { Module } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { PosSummaryService } from './pos-summary.service';

@Module({
  controllers: [PosSummaryController],
  providers: [PosSummaryService],
})
export class PosModule {}
