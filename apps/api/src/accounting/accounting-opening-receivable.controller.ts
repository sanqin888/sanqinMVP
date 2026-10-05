import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type { CreateAccountingOpeningReceivableInputV1 } from './accounting-opening-receivable.contract';
import type { CreateAccountingOpeningReceivableSettlementInputV1 } from './accounting-opening-receivable-settlement.contract';
import { AccountingOpeningReceivableSettlementService } from './accounting-opening-receivable-settlement.service';
import { AccountingOpeningReceivableService } from './accounting-opening-receivable.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingOpeningReceivableController {
  constructor(
    private readonly openingReceivables: AccountingOpeningReceivableService,
    private readonly openingReceivableSettlements: AccountingOpeningReceivableSettlementService,
  ) {}

  @Get('opening-receivables')
  listOpeningReceivables(@Query('limit') limit?: string) {
    return this.openingReceivables.list(limit);
  }

  @Get('opening-receivables/:openingReceivableStableId')
  openingReceivableDetail(
    @Param('openingReceivableStableId') openingReceivableStableId: string,
  ) {
    return this.openingReceivables.get(openingReceivableStableId);
  }

  @Post('opening-receivables/settlements')
  createOpeningReceivableSettlement(
    @Body() body: CreateAccountingOpeningReceivableSettlementInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.openingReceivableSettlements.create(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('opening-receivables')
  createOpeningReceivable(
    @Body() body: CreateAccountingOpeningReceivableInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.openingReceivables.create(
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
