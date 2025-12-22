import { Controller, Get, Query } from '@nestjs/common';
import { PosSummaryService } from './pos-summary.service';

@Controller('pos')
export class PosSummaryController {
  constructor(private readonly service: PosSummaryService) {}

  /**
   * GET /api/v1/pos/summary?timeMin=...&timeMax=...&fulfillmentType=pickup|dine_in|delivery&status=paid|refunded|void&payment=cash|card|online|unknown
   */
  @Get('summary')
  getSummary(
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('fulfillmentType') fulfillmentType?: string,
    @Query('status') statusBucket?: string,
    @Query('payment') paymentBucket?: string,
  ) {
    return this.service.summary({
      timeMin,
      timeMax,
      fulfillmentType,
      status: statusBucket,
      payment: paymentBucket,
    });
  }
}
