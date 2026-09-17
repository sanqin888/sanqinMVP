import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderFinancialController {
  constructor(
    private readonly providerFinancial: AccountingProviderFinancialService,
  ) {}

  @Post('inbox/:inboxItemStableId/provider-financial/confirm')
  confirmProviderFinancialInboxItem(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.providerFinancial.confirmSelectedInboxFinancialEvidence(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }
}
