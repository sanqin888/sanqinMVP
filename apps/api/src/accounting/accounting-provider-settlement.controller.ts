import {
  BadRequestException,
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
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderSettlementController {
  constructor(
    private readonly providerSettlementPreview: AccountingProviderSettlementPreviewService,
    private readonly providerSettlementExecution: AccountingProviderSettlementExecutionService,
    private readonly providerSettlementQuery: AccountingProviderSettlementQueryService,
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

  @Get('journal/provider-settlement/posting-states')
  providerSettlementPostingStates(
    @Query('documentStableIds') documentStableIds?: string,
  ) {
    const stableIds = (documentStableIds ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (stableIds.length > 200) {
      throw new BadRequestException(
        'provider settlement posting-state query supports at most 200 documents',
      );
    }
    if (stableIds.some((value) => value.length > 128)) {
      throw new BadRequestException(
        'invalid provider financial document stable id',
      );
    }
    return this.providerSettlementQuery.readProviderDocumentPostingStates(
      stableIds,
    );
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
