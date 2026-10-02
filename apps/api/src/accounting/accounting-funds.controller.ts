import {
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
  parseNonNegativeAccountingNumber,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type { AccountingAccountTransferInput } from './accounting-account-transfer.policy';
import { AccountingAccountTransferService } from './accounting-account-transfer.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingFundsController {
  constructor(
    private readonly accountTransfers: AccountingAccountTransferService,
  ) {}

  @Get('account-transfers')
  listAccountTransfers(
    @Query('limit') limit?: string,
    @Query('transferStableId') transferStableId?: string,
  ) {
    return this.accountTransfers.listTransfers(
      parseNonNegativeAccountingNumber(limit, 'limit'),
      transferStableId,
    );
  }

  @Post('account-transfers')
  createAccountTransfer(
    @Body() body: AccountingAccountTransferInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountTransfers.createTransfer(
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
