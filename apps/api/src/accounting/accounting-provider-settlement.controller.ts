import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  parseAccountingFinancialProvider,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingProviderSettlementExecutionService } from './accounting-provider-settlement-execution.service';
import { AccountingCloverFeeReclassificationService } from './accounting-clover-fee-reclassification.service';
import { AccountingProviderSettlementPreviewService } from './accounting-provider-settlement-preview.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import { AccountingCloverAuthorityReplacementService } from './accounting-clover-authority-replacement.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderSettlementController {
  constructor(
    private readonly providerSettlementPreview: AccountingProviderSettlementPreviewService,
    private readonly providerSettlementExecution: AccountingProviderSettlementExecutionService,
    private readonly providerSettlementQuery: AccountingProviderSettlementQueryService,
    private readonly cloverFeeReclassification: AccountingCloverFeeReclassificationService,
    private readonly cloverAuthorityReplacement: AccountingCloverAuthorityReplacementService,
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

  @Get('journal/provider-settlement/clover-fee-reclassification-preview')
  previewCloverFeeReclassification(
    @Query('documentStableId') documentStableId?: string,
  ) {
    return this.cloverFeeReclassification.preview(documentStableId ?? '');
  }

  @Post('journal/provider-settlement/clover-fee-reclassification')
  executeCloverFeeReclassification(
    @Body()
    body: {
      documentStableId?: string;
      expectedPlanHash?: string;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.cloverFeeReclassification.execute({
      documentStableId: body.documentStableId ?? '',
      expectedPlanHash: body.expectedPlanHash ?? '',
      operatorActorRef: requireAccountingOperatorUserId(req),
    });
  }

  @Post('journal/clover-authority-replacement')
  executeCloverAuthorityReplacement(
    @Body()
    body: {
      storeStableId?: string;
      expectedPlanHash?: string;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.cloverAuthorityReplacement.execute({
      storeStableId: body.storeStableId ?? '',
      expectedPlanHash: body.expectedPlanHash ?? '',
      operatorActorRef: requireAccountingOperatorUserId(req),
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
