import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import type {
  AccountingExpenseInput,
  AccountingExpensePaymentCompletionInput,
  AccountingExpensePaymentState,
  AccountingExpenseSplitFundingCompletionInput,
} from './accounting-expense.contracts';
import { AccountingExpenseService } from './accounting-expense.service';

function parseExpensePaymentState(
  raw: string | undefined,
): AccountingExpensePaymentState | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === 'ASSIGNED' || value === 'UNASSIGNED') return value;
  throw new BadRequestException('paymentState must be ASSIGNED or UNASSIGNED');
}

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

  @Get('expenses/records')
  listExpenseRecords(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minTotalCents') minTotalCents?: string,
    @Query('paymentAccountStableId') paymentAccountStableId?: string,
    @Query('paymentState') paymentState?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.expense.listExpenseRecords({
      from,
      to,
      minTotalCents: parseNonNegativeAccountingNumber(
        minTotalCents,
        'minTotalCents',
      ),
      paymentAccountStableId,
      paymentState: parseExpensePaymentState(paymentState),
      limit: parseNonNegativeAccountingNumber(limit, 'limit'),
      offset: parseNonNegativeAccountingNumber(offset, 'offset'),
    });
  }

  @Put('expenses/:documentStableId/payment-allocations')
  completeExpensePaymentAllocations(
    @Param('documentStableId') documentStableId: string,
    @Body() body: AccountingExpensePaymentCompletionInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.completeExpensePaymentAllocations(
      documentStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Put('expenses/:documentStableId/split-funding')
  completeExpenseSplitFunding(
    @Param('documentStableId') documentStableId: string,
    @Body() body: AccountingExpenseSplitFundingCompletionInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.completeExpenseSplitFunding(
      documentStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
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
