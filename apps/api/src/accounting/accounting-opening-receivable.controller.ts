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
import type {
  CreateAccountingOpeningReceivableInputV1,
  ReverseAccountingOpeningReceivableInputV1,
} from './accounting-opening-receivable.contract';
import type { CreateAccountingOpeningReceivableSettlementInputV1 } from './accounting-opening-receivable-settlement.contract';
import { AccountingOpeningReceivableSettlementService } from './accounting-opening-receivable-settlement.service';
import { AccountingOpeningReceivableReversalService } from './accounting-opening-receivable-reversal.service';
import { AccountingOpeningReceivableService } from './accounting-opening-receivable.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingOpeningReceivableController {
  constructor(
    private readonly openingReceivables: AccountingOpeningReceivableService,
    private readonly openingReceivableSettlements: AccountingOpeningReceivableSettlementService,
    private readonly openingReceivableReversals: AccountingOpeningReceivableReversalService,
  ) {}

  @Get('opening-receivables')
  listOpeningReceivables(@Query('limit') limit?: string) {
    return this.openingReceivables.list(limit);
  }

  @Get('opening-receivables/options')
  openingReceivableOptions() {
    return this.openingReceivables.formOptions();
  }

  @Get('opening-receivables/:openingReceivableStableId')
  openingReceivableDetail(
    @Param('openingReceivableStableId') openingReceivableStableId: string,
  ) {
    return this.openingReceivables.get(openingReceivableStableId);
  }

  @Post('opening-receivables/:openingReceivableStableId/reverse')
  reverseOpeningReceivable(
    @Param('openingReceivableStableId') openingReceivableStableId: string,
    @Body() body: ReverseAccountingOpeningReceivableInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.openingReceivableReversals.reverseOpeningReceivable(
      openingReceivableStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('opening-receivables/settlements/:settlementStableId/reverse')
  reverseOpeningReceivableSettlement(
    @Param('settlementStableId') settlementStableId: string,
    @Body() body: ReverseAccountingOpeningReceivableInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.openingReceivableReversals.reverseSettlement(
      settlementStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
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
