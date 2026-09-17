import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingTxType } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { countAccountingInboxReviewItems } from './accounting-inbox-query';
import { AccountingPeriodService } from './accounting-period.service';

@Injectable()
export class AccountingFinancialReportsService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async dashboard(from: string, to: string) {
    const fromDate = await this.period.clampAccountingFromDate(
      this.parseDate(from),
    );
    const toDate = this.parseDate(to, true);
    const where: Prisma.AccountingTransactionWhereInput = {
      deletedAt: null,
      occurredAt: { gte: fromDate, lte: toDate },
    };
    const rows = await this.prisma.accountingTransaction.findMany({
      where,
      select: {
        type: true,
        amountCents: true,
        taxCents: true,
        source: true,
        category: { select: { name: true, categoryStableId: true } },
      },
    });
    let incomeCents = 0;
    let expenseCents = 0;
    let adjustmentCents = 0;
    let taxCents = 0;
    const expenseCategories = new Map<
      string,
      { name: string; amountCents: number }
    >();
    for (const row of rows) {
      taxCents += row.taxCents;
      if (row.type === AccountingTxType.INCOME) incomeCents += row.amountCents;
      if (row.type === AccountingTxType.EXPENSE) {
        expenseCents += row.amountCents;
        const previous = expenseCategories.get(
          row.category.categoryStableId,
        ) ?? {
          name: row.category.name,
          amountCents: 0,
        };
        previous.amountCents += row.amountCents;
        expenseCategories.set(row.category.categoryStableId, previous);
      }
      if (row.type === AccountingTxType.ADJUSTMENT) {
        adjustmentCents += row.amountCents;
      }
    }

    const pendingInboxItems = await countAccountingInboxReviewItems(
      this.prisma,
    );
    const latestClosedMonth =
      await this.prisma.accountingPeriodClose.findFirst({
        where: { periodType: 'MONTH' },
        orderBy: { closedAt: 'desc' },
        select: { periodKey: true },
      });

    return {
      from,
      to,
      summary: {
        incomeCents,
        expenseCents,
        adjustmentCents,
        netProfitCents: incomeCents - expenseCents + adjustmentCents,
        taxCents,
      },
      pending: {
        inboxItems: pendingInboxItems,
      },
      topExpenseCategories: Array.from(expenseCategories.entries())
        .map(([categoryStableId, value]) => ({ categoryStableId, ...value }))
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 8),
      lastClosedMonth: latestClosedMonth?.periodKey ?? null,
    };
  }

  private parseDate(raw: string, endOfDay = false) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`invalid date: ${raw}`);
    }
    if (raw.length <= 10) {
      if (endOfDay) parsed.setHours(23, 59, 59, 999);
      else parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
  }
}
