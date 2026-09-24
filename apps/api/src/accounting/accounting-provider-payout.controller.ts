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
  parseNonNegativeAccountingNumber,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingProviderPayoutService } from './accounting-provider-payout.service';
import { AccountingProviderPayoutBankMatchService } from './accounting-provider-payout-bank-match.service';
import { AccountingProviderPayoutBankRowDecisionService } from './accounting-provider-payout-bank-row-decision.service';
import { AccountingProviderPendingReconciliationService } from './accounting-provider-pending-reconciliation.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderPayoutController {
  constructor(
    private readonly payouts: AccountingProviderPayoutService,
    private readonly bankMatch: AccountingProviderPayoutBankMatchService,
    private readonly bankRowDecisions: AccountingProviderPayoutBankRowDecisionService,
    private readonly pendingReconciliation: AccountingProviderPendingReconciliationService,
  ) {}

  @Get('provider-payouts/bank-match-preview')
  previewBankMatches(
    @Query('artifactStableId') artifactStableId?: string,
    @Query('storeStableId') storeStableId?: string,
    @Query('destinationBankAccountStableId')
    destinationBankAccountStableId?: string,
  ) {
    return this.bankMatch.preview({
      artifactStableId: artifactStableId ?? '',
      storeStableId: storeStableId ?? '',
      destinationBankAccountStableId: destinationBankAccountStableId ?? '',
    });
  }

  @Get('provider-payouts/bank-row-decisions')
  getBankRowDecisions(
    @Query('artifactStableId') artifactStableId?: string,
    @Query('storeStableId') storeStableId?: string,
    @Query('destinationBankAccountStableId')
    destinationBankAccountStableId?: string,
  ) {
    return this.bankRowDecisions.getScope({
      artifactStableId: artifactStableId ?? '',
      storeStableId: storeStableId ?? '',
      destinationBankAccountStableId: destinationBankAccountStableId ?? '',
    });
  }

  @Post('provider-payouts/bank-row-decisions/confirm')
  confirmBankRowDecisions(
    @Body()
    body: {
      artifactStableId?: string;
      storeStableId?: string;
      destinationBankAccountStableId?: string;
      includedRowNumbers?: number[];
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.bankRowDecisions.confirmScope(
      {
        artifactStableId: body.artifactStableId ?? '',
        storeStableId: body.storeStableId ?? '',
        destinationBankAccountStableId:
          body.destinationBankAccountStableId ?? '',
        includedRowNumbers: body.includedRowNumbers ?? [],
      },
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('provider-pending-reconciliation')
  reconcileProviderPending(
    @Query('storeStableId') storeStableId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('provider') providerRaw?: string,
  ) {
    return this.pendingReconciliation.reconcile({
      storeStableId: storeStableId ?? '',
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(providerRaw
        ? { provider: parseAccountingFinancialProvider(providerRaw) }
        : {}),
    });
  }

  @Get('provider-payouts')
  listPayouts(
    @Query('provider') providerRaw?: string,
    @Query('storeStableId') storeStableId?: string,
    @Query('limit') limitRaw?: string,
    @Query('payoutStableId') payoutStableId?: string,
  ) {
    return this.payouts.listPayouts({
      ...(providerRaw
        ? { provider: parseAccountingFinancialProvider(providerRaw) }
        : {}),
      ...(storeStableId?.trim() ? { storeStableId: storeStableId.trim() } : {}),
      ...(payoutStableId?.trim()
        ? { payoutStableId: payoutStableId.trim() }
        : {}),
      limit: parseNonNegativeAccountingNumber(limitRaw, 'limit'),
    });
  }

  @Post('provider-payouts/from-bank-row-decision')
  recordPayoutFromBankRowDecision(
    @Body() body: { decisionStableId?: string },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.payouts.recordPayoutFromBankRowDecision(
      body.decisionStableId ?? '',
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('provider-payouts')
  recordPayout(
    @Body()
    body: {
      payoutStableId?: string;
      provider?: string;
      storeStableId?: string;
      payoutDate?: string;
      destinationBankAccountStableId?: string;
      amountCents?: number;
      currency?: string;
      providerReference?: string | null;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    const provider = parseAccountingFinancialProvider(body.provider);
    if (!provider) {
      throw new BadRequestException('provider is required');
    }
    return this.payouts.recordPayout(
      {
        payoutStableId: body.payoutStableId ?? '',
        provider,
        storeStableId: body.storeStableId ?? '',
        payoutDate: body.payoutDate ?? '',
        destinationBankAccountStableId:
          body.destinationBankAccountStableId ?? '',
        amountCents: body.amountCents ?? 0,
        currency: body.currency ?? 'CAD',
        providerReference: body.providerReference ?? null,
      },
      requireAccountingOperatorUserId(req),
    );
  }
}
