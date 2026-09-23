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
import { AccountingProviderPendingReconciliationService } from './accounting-provider-pending-reconciliation.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderPayoutController {
  constructor(
    private readonly payouts: AccountingProviderPayoutService,
    private readonly pendingReconciliation: AccountingProviderPendingReconciliationService,
  ) {}

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
  ) {
    return this.payouts.listPayouts({
      ...(providerRaw
        ? { provider: parseAccountingFinancialProvider(providerRaw) }
        : {}),
      ...(storeStableId?.trim() ? { storeStableId: storeStableId.trim() } : {}),
      limit: parseNonNegativeAccountingNumber(limitRaw, 'limit'),
    });
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
