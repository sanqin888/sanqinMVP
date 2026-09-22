import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { AccountingExpenseJournalPreviewService } from './accounting-expense-journal-preview.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingExpenseJournalController {
  constructor(
    private readonly expenseJournalPreview: AccountingExpenseJournalPreviewService,
  ) {}

  @Get('journal/canonical-expenses/shadow-preview')
  canonicalExpenseShadowPreview(
    @Query('fromDate') fromDate?: string,
    @Query('toDateExclusive') toDateExclusive?: string,
  ) {
    return this.expenseJournalPreview.previewRange({
      ...(fromDate ? { fromDate } : {}),
      toDateExclusive: toDateExclusive ?? '',
    });
  }
}
