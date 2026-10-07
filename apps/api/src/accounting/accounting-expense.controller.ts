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
import { AccountingExpenseCorrectionService } from './accounting-expense-correction.service';
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
  constructor(
    private readonly expense: AccountingExpenseService,
    private readonly expenseCorrection: AccountingExpenseCorrectionService,
  ) {}

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
    @Query('documentStableId') documentStableId?: string,
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
      documentStableId,
    });
  }

  @Get('journal/expense/:documentStableId/correction')
  readExpenseCorrection(@Param('documentStableId') documentStableId: string) {
    return this.expenseCorrection.readRecord(documentStableId);
  }

  @Post('journal/expense/:documentStableId/corrections')
  createPostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Body()
    body: {
      reasonCode?: unknown;
      note?: unknown;
      target?: unknown;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseCorrection.createDraft(
      documentStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post(
    'journal/expense/:documentStableId/corrections/:correctionStableId/revise',
  )
  revisePostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Param('correctionStableId') correctionStableId: string,
    @Body()
    body: {
      expectedVersion?: unknown;
      reasonCode?: unknown;
      note?: unknown;
      target?: unknown;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseCorrection.reviseDraft(
      documentStableId,
      correctionStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get(
    'journal/expense/:documentStableId/corrections/:correctionStableId/preview',
  )
  previewPostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Param('correctionStableId') correctionStableId: string,
  ) {
    return this.expenseCorrection.previewCase(
      documentStableId,
      correctionStableId,
    );
  }

  @Post(
    'journal/expense/:documentStableId/corrections/:correctionStableId/ready',
  )
  readyPostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Param('correctionStableId') correctionStableId: string,
    @Body()
    body: {
      expectedVersion?: unknown;
      expectedPlanHash?: unknown;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseCorrection.markReady(
      documentStableId,
      correctionStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post(
    'journal/expense/:documentStableId/corrections/:correctionStableId/post',
  )
  postPostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Param('correctionStableId') correctionStableId: string,
    @Body() body: { expectedPlanHash?: unknown },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseCorrection.executeCase(
      documentStableId,
      correctionStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post(
    'journal/expense/:documentStableId/corrections/:correctionStableId/cancel',
  )
  cancelPostedExpenseCorrection(
    @Param('documentStableId') documentStableId: string,
    @Param('correctionStableId') correctionStableId: string,
    @Body() body: { expectedVersion?: unknown },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseCorrection.cancelCase(
      documentStableId,
      correctionStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
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

  @Post('inbox/:inboxItemStableId/expense/review')
  beginInboxExpenseReview(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.beginUnifiedInboxExpenseReview(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('expenses/:documentStableId/confirm')
  confirmPendingExpense(
    @Param('documentStableId') documentStableId: string,
    @Body() body: AccountingExpenseInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.confirmInboxDocument(
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
