import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { parseAccountingFinancialProvider } from './accounting-controller-support';
import { AccountingProviderSettlementExecutionService } from './accounting-provider-settlement-execution.service';
import { AccountingProviderSettlementPreviewService } from './accounting-provider-settlement-preview.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderSettlementController {
  constructor(
    private readonly providerSettlementPreview: AccountingProviderSettlementPreviewService,
    private readonly providerSettlementExecution: AccountingProviderSettlementExecutionService,
  ) {}

  @Get('journal/provider-settlement/shadow-preview')
  providerSettlementShadowPreview(
    @Query('fromDate') fromDate?: string,
    @Query('toDateExclusive') toDateExclusive?: string,
    @Query('storeStableId') storeStableId?: string,
    @Query('provider') provider?: string,
  ) {
    return this.providerSettlementPreview.previewRange({
      ...(fromDate ? { fromDate } : {}),
      toDateExclusive: toDateExclusive ?? '',
      storeStableId: storeStableId ?? '',
      ...(provider
        ? { provider: parseAccountingFinancialProvider(provider) }
        : {}),
    });
  }

  @Post('journal/provider-settlement/replay')
  executeProviderSettlementReplay(
    @Body()
    body: {
      fromDate?: string;
      toDateExclusive?: string;
      storeStableId?: string;
      provider?: string;
      expectedPlanHash?: string;
    },
  ) {
    return this.providerSettlementExecution.executeRange({
      ...(body.fromDate ? { fromDate: body.fromDate } : {}),
      toDateExclusive: body.toDateExclusive ?? '',
      storeStableId: body.storeStableId ?? '',
      ...(body.provider
        ? { provider: parseAccountingFinancialProvider(body.provider) }
        : {}),
      expectedPlanHash: body.expectedPlanHash ?? '',
    });
  }
}
