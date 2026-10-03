import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type {
  CreateAccountingExternalSaleInputV1,
  CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';
import { AccountingExternalSaleSettlementService } from './accounting-external-sale-settlement.service';
import { AccountingExternalSalesService } from './accounting-external-sales.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingExternalSalesController {
  constructor(
    private readonly externalSales: AccountingExternalSalesService,
    private readonly settlements: AccountingExternalSaleSettlementService,
  ) {}

  @Post('external-sales')
  createExternalSale(
    @Body() body: CreateAccountingExternalSaleInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.externalSales.createSale(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('external-sales/settlements')
  createExternalSaleSettlement(
    @Body() body: CreateAccountingExternalSaleSettlementInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.settlements.createSettlement(
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
