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
import { AccountingDocumentStatus } from './accounting-contracts';
import {
  type AuthedAccountingRequest,
  parseNonNegativeAccountingNumber,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type { AccountingExpenseInput } from './accounting-expense.contracts';
import { AccountingExpenseService } from './accounting-expense.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingExpenseController {
  constructor(private readonly expense: AccountingExpenseService) {}

  @Post('expenses')
  createExpense(
    @Body() body: AccountingExpenseInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.createExpense(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('expenses')
  listExpenses(
    @Query('status') status?: AccountingDocumentStatus,
    @Query('limit') limit?: string,
  ) {
    return this.expense.listExpenseDocuments({
      status,
      limit: parseNonNegativeAccountingNumber(limit, 'limit'),
    });
  }

  @Post('inbox/:inboxItemStableId/expense/confirm')
  confirmInboxExpense(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Body() body: AccountingExpenseInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.confirmUnifiedInboxExpense(
      inboxItemStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
