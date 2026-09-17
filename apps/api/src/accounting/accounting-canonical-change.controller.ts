import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { AccountingCanonicalChangeExecutionService } from './accounting-canonical-change-execution.service';
import { AccountingCanonicalChangePreviewService } from './accounting-canonical-change-preview.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingCanonicalChangeController {
  constructor(
    private readonly canonicalChangePreview: AccountingCanonicalChangePreviewService,
    private readonly canonicalChangeExecution: AccountingCanonicalChangeExecutionService,
  ) {}

  @Get('journal/canonical-changes/shadow-preview')
  canonicalChangeShadowPreview(
    @Query('fromDate') fromDate?: string,
    @Query('toDateExclusive') toDateExclusive?: string,
    @Query('storeStableId') storeStableId?: string,
  ) {
    return this.canonicalChangePreview.previewRange({
      ...(fromDate ? { fromDate } : {}),
      toDateExclusive: toDateExclusive ?? '',
      storeStableId: storeStableId ?? '',
    });
  }

  @Post('journal/canonical-changes/replay')
  executeCanonicalChangeReplay(
    @Body()
    body: {
      fromDate?: string;
      toDateExclusive?: string;
      storeStableId?: string;
      expectedPlanHash?: string;
    },
  ) {
    return this.canonicalChangeExecution.executeRange({
      ...(body.fromDate ? { fromDate: body.fromDate } : {}),
      toDateExclusive: body.toDateExclusive ?? '',
      storeStableId: body.storeStableId ?? '',
      expectedPlanHash: body.expectedPlanHash ?? '',
    });
  }
}
