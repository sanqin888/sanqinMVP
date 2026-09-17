import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { AccountingCanonicalSaleReplayService } from './accounting-canonical-sale-replay.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingCanonicalSaleController {
  constructor(
    private readonly canonicalSaleReplay: AccountingCanonicalSaleReplayService,
  ) {}

  @Get('journal/canonical-sales/replay-preview')
  canonicalSaleReplayPreview(
    @Query('fromDate') fromDate?: string,
    @Query('toDateExclusive') toDateExclusive?: string,
    @Query('storeStableId') storeStableId?: string,
  ) {
    return this.canonicalSaleReplay.previewRange({
      ...(fromDate ? { fromDate } : {}),
      toDateExclusive: toDateExclusive ?? '',
      storeStableId: storeStableId ?? '',
    });
  }

  @Post('journal/canonical-sales/replay')
  executeCanonicalSaleReplay(
    @Body()
    body: {
      fromDate?: string;
      toDateExclusive?: string;
      storeStableId?: string;
      expectedPlanHash?: string;
      acknowledgedBlockedOrderStableIds?: string[];
    },
  ) {
    return this.canonicalSaleReplay.executeRange({
      ...(body.fromDate ? { fromDate: body.fromDate } : {}),
      toDateExclusive: body.toDateExclusive ?? '',
      storeStableId: body.storeStableId ?? '',
      expectedPlanHash: body.expectedPlanHash ?? '',
      acknowledgedBlockedOrderStableIds:
        body.acknowledgedBlockedOrderStableIds ?? [],
    });
  }
}
