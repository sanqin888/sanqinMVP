import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PosSummaryService } from './pos-summary.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from './pos-device.guard';

@Controller('pos')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
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
