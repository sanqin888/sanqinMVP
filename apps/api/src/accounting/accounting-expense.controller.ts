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
import type {
  AccountingExpenseInput,
  AccountingInboxExpenseConfirmInput,
} from './accounting-expense.contracts';
import type { AccountingExpenseReviewDraftInput } from './accounting-expense-review.policy';
import { AccountingExpenseReviewService } from './accounting-expense-review.service';
import { AccountingExpenseService } from './accounting-expense.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingExpenseController {
  constructor(
    private readonly expense: AccountingExpenseService,
    private readonly expenseReview: AccountingExpenseReviewService,
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

  @Get('inbox/:inboxItemStableId/expense/review-revisions')
  listInboxExpenseReviewRevisions(
    @Param('inboxItemStableId') inboxItemStableId: string,
  ) {
    return this.expenseReview.listReviewRevisions(inboxItemStableId);
  }

  @Post('inbox/:inboxItemStableId/expense/review-revisions')
  createInboxExpenseReviewDraft(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Body() body: AccountingExpenseReviewDraftInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseReview.createDraft(
      inboxItemStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post(
    'inbox/:inboxItemStableId/expense/review-revisions/:reviewRevisionStableId/confirm',
  )
  confirmInboxExpenseReviewRevision(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Param('reviewRevisionStableId') reviewRevisionStableId: string,
    @Body() body: { expectedReviewHash: string },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expenseReview.confirmRevision(
      inboxItemStableId,
      reviewRevisionStableId,
      body.expectedReviewHash,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('inbox/:inboxItemStableId/expense/confirm')
  confirmInboxExpense(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Body() body: AccountingInboxExpenseConfirmInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.expense.confirmUnifiedInboxExpense(
      inboxItemStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
