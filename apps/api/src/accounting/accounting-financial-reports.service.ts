import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  renderAccountingFinancialFactsCsv,
  renderAccountingPnlCsv,
  renderAccountingPnlPdf,
} from './accounting-financial-report-export';
import {
  classifyAccountingCashflowContext,
  projectAccountingJournalReportEntry,
  type AccountingFinancialReportFact,
  type AccountingFinancialReportProjection,
} from './accounting-financial-report-policy';
import { CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2 } from './accounting-expense-journal.policy';
import { countAccountingInboxReviewItems } from './accounting-inbox-query';
import { AccountingPeriodService } from './accounting-period.service';

type FinancialFactFilters = {
  from?: string;
  to?: string;
  categoryStableId?: string;
  source?: string;
  keyword?: string;
};

type FinancialReportScope = 'MANAGEMENT' | 'CANONICAL';

@Injectable()
export class AccountingFinancialReportsService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async dashboard(from: string, to: string) {
    const projection = await this.readProjection(from, to, 'MANAGEMENT');
    let incomeCents = 0;
    let expenseCents = 0;
    let adjustmentCents = 0;
    const expenseCategories = new Map<
      string,
      { name: string; amountCents: number }
    >();

    for (const fact of projection.facts) {
      if (fact.type === AccountingTxType.INCOME)
        incomeCents += fact.amountCents;
      if (fact.type === AccountingTxType.EXPENSE) {
        expenseCents += fact.amountCents;
        const previous = expenseCategories.get(fact.categoryStableId) ?? {
          name: fact.categoryName,
          amountCents: 0,
        };
        previous.amountCents += fact.amountCents;
        expenseCategories.set(fact.categoryStableId, previous);
      }
      if (fact.type === AccountingTxType.ADJUSTMENT) {
        adjustmentCents += fact.amountCents;
      }
    }

    const pendingInboxItems = await countAccountingInboxReviewItems(
      this.prisma,
    );
    const latestClosedMonth = await this.prisma.accountingPeriodClose.findFirst(
      {
        where: { periodType: 'MONTH' },
        orderBy: { closedAt: 'desc' },
        select: { periodKey: true },
      },
    );

    return {
      from,
      to,
      summary: {
        incomeCents,
        expenseCents,
        adjustmentCents,
        netProfitCents: incomeCents - expenseCents + adjustmentCents,
        taxCents:
          projection.journalInputTaxCents + projection.expenseInputTaxCents,
      },
      pending: { inboxItems: pendingInboxItems },
      topExpenseCategories: Array.from(expenseCategories.entries())
        .map(([categoryStableId, value]) => ({ categoryStableId, ...value }))
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 8),
      lastClosedMonth: latestClosedMonth?.periodKey ?? null,
    };
  }

  async pnlReport(query: {
    from?: string;
    to?: string;
    groupBy?: 'month' | 'quarter' | 'year';
  }) {
    const groupBy = query.groupBy ?? 'month';
    const timezone = await this.period.getBusinessTimezone();
    const projection = await this.readProjection(
      query.from,
      query.to,
      'MANAGEMENT',
    );
    const categoriesMeta = await this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      select: {
        categoryStableId: true,
        name: true,
        type: true,
        parent: { select: { categoryStableId: true } },
      },
    });

    const getBucket = (date: Date) => {
      const zoned = DateTime.fromJSDate(date, { zone: timezone });
      if (!zoned.isValid) {
        throw new BadRequestException(
          `Invalid occurredAt for timezone ${timezone}`,
        );
      }
      if (groupBy === 'year') return `${zoned.year}`;
      if (groupBy === 'quarter') {
        return `${zoned.year}-Q${Math.floor((zoned.month - 1) / 3) + 1}`;
      }
      return `${zoned.year}-${zoned.month.toString().padStart(2, '0')}`;
    };

    const periods = new Map<
      string,
      { income: number; expense: number; adjustment: number; transfer: number }
    >();
    const categories = new Map<
      string,
      {
        categoryStableId: string;
        categoryName: string;
        type: AccountingTxType;
        amountCents: number;
      }
    >();
    const sources = new Map<string, number>();
    const adjustmentBreakdown = new Map<
      string,
      {
        source: AccountingJournalSource;
        sourceFactType: string | null;
        journalCount: number;
        revenueNetCents: number;
        expenseNetCents: number;
        netProfitEffectCents: number;
      }
    >();
    const monthNetMap = new Map<string, number>();

    for (const fact of projection.facts) {
      const bucket = getBucket(fact.occurredAt);
      const period = periods.get(bucket) ?? {
        income: 0,
        expense: 0,
        adjustment: 0,
        transfer: 0,
      };
      if (fact.type === AccountingTxType.INCOME)
        period.income += fact.amountCents;
      if (fact.type === AccountingTxType.EXPENSE)
        period.expense += fact.amountCents;
      if (fact.type === AccountingTxType.ADJUSTMENT) {
        period.adjustment += fact.amountCents;
      }
      if (fact.type === AccountingTxType.TRANSFER) {
        period.transfer += fact.amountCents;
      }
      periods.set(bucket, period);

      const category = categories.get(fact.categoryStableId) ?? {
        categoryStableId: fact.categoryStableId,
        categoryName: fact.categoryName,
        type: fact.type,
        amountCents: 0,
      };
      category.amountCents += fact.amountCents;
      categories.set(fact.categoryStableId, category);
      sources.set(
        fact.source,
        (sources.get(fact.source) ?? 0) + fact.amountCents,
      );

      const monthKey = this.period.toPeriodKey(fact.occurredAt, timezone);
      const monthNet =
        fact.type === AccountingTxType.INCOME
          ? fact.amountCents
          : fact.type === AccountingTxType.EXPENSE
            ? -fact.amountCents
            : fact.type === AccountingTxType.ADJUSTMENT
              ? fact.amountCents
              : 0;
      monthNetMap.set(monthKey, (monthNetMap.get(monthKey) ?? 0) + monthNet);
    }

    for (const effect of projection.adjustmentEffects) {
      const key = `${effect.source}\u0000${effect.sourceFactType ?? ''}`;
      const row = adjustmentBreakdown.get(key) ?? {
        source: effect.source,
        sourceFactType: effect.sourceFactType,
        journalCount: 0,
        revenueNetCents: 0,
        expenseNetCents: 0,
        netProfitEffectCents: 0,
      };
      row.journalCount += 1;
      row.revenueNetCents += effect.revenueNetCents;
      row.expenseNetCents += effect.expenseNetCents;
      row.netProfitEffectCents += effect.netProfitEffectCents;
      adjustmentBreakdown.set(key, row);
    }

    const totals = Array.from(periods.values()).reduce(
      (acc, item) => ({
        income: acc.income + item.income,
        expense: acc.expense + item.expense,
        adjustment: acc.adjustment + item.adjustment,
        transfer: acc.transfer + item.transfer,
      }),
      { income: 0, expense: 0, adjustment: 0, transfer: 0 },
    );
    const adjustmentBreakdownRows = Array.from(
      adjustmentBreakdown.values(),
    ).sort(
      (left, right) =>
        Math.abs(right.netProfitEffectCents) -
          Math.abs(left.netProfitEffectCents) ||
        left.source.localeCompare(right.source) ||
        (left.sourceFactType ?? '').localeCompare(right.sourceFactType ?? ''),
    );
    const adjustmentBreakdownNetCents = adjustmentBreakdownRows.reduce(
      (sum, row) => sum + row.netProfitEffectCents,
      0,
    );
    if (adjustmentBreakdownNetCents !== totals.adjustment) {
      throw new BadRequestException(
        'P&L adjustment breakdown does not reconcile to adjustment total',
      );
    }

    const categoryNodeMap = new Map(
      categoriesMeta.map((item) => [
        item.categoryStableId,
        {
          categoryStableId: item.categoryStableId,
          categoryName: item.name,
          type: item.type,
          parentStableId: item.parent?.categoryStableId ?? null,
          amountCents: categories.get(item.categoryStableId)?.amountCents ?? 0,
        },
      ]),
    );
    for (const node of categoryNodeMap.values()) {
      let parentStableId = node.parentStableId;
      while (parentStableId) {
        const parent = categoryNodeMap.get(parentStableId);
        if (!parent) break;
        parent.amountCents += node.amountCents;
        parentStableId = parent.parentStableId;
      }
    }

    const nowInTimezone = DateTime.fromJSDate(new Date(), { zone: timezone });
    if (!nowInTimezone.isValid) {
      throw new BadRequestException(`Invalid now for timezone ${timezone}`);
    }
    const currentMonth = this.period.toPeriodKey(new Date(), timezone);
    const lastMonth = nowInTimezone.minus({ months: 1 }).toFormat('yyyy-MM');
    const currentQuarterStart = nowInTimezone.startOf('quarter');
    const quarterMonths = [0, 1, 2].map((offset) =>
      currentQuarterStart.plus({ months: offset }).toFormat('yyyy-MM'),
    );

    const periodRows = Array.from(periods.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, value]) => ({
        period,
        incomeCents: value.income,
        expenseCents: value.expense,
        adjustmentCents: value.adjustment,
        transferCents: value.transfer,
        netProfitCents: value.income - value.expense + value.adjustment,
        isClosed: false,
      }));
    const monthPeriods = periodRows
      .map((item) => item.period)
      .filter((item) => /^\d{4}-\d{2}$/.test(item));
    const closeMap = new Map(
      (await this.period.listPeriodCloseStatus(monthPeriods)).map((row) => [
        row.periodKey,
        row,
      ]),
    );

    return {
      groupBy,
      from: query.from ?? null,
      to: query.to ?? null,
      summary: {
        incomeCents: totals.income,
        expenseCents: totals.expense,
        adjustmentCents: totals.adjustment,
        transferCents: totals.transfer,
        netProfitCents: totals.income - totals.expense + totals.adjustment,
      },
      periods: periodRows.map((item) => ({
        ...item,
        isClosed: closeMap.has(item.period),
      })),
      byCategory: Array.from(categories.values()).sort(
        (a, b) => b.amountCents - a.amountCents,
      ),
      byCategoryTree: Array.from(categoryNodeMap.values())
        .sort((a, b) => b.amountCents - a.amountCents)
        .map((item) => ({
          categoryStableId: item.categoryStableId,
          categoryName: item.categoryName,
          type: item.type,
          parentStableId: item.parentStableId,
          amountCents: item.amountCents,
        })),
      bySource: Array.from(sources.entries()).map(([source, amountCents]) => ({
        source,
        amountCents,
      })),
      adjustmentBreakdown: adjustmentBreakdownRows,
      trends: {
        currentMonthNetCents: monthNetMap.get(currentMonth) ?? 0,
        lastMonthNetCents: monthNetMap.get(lastMonth) ?? 0,
        quarterToDateNetCents: quarterMonths.reduce(
          (sum, month) => sum + (monthNetMap.get(month) ?? 0),
          0,
        ),
      },
      closeStatus: {
        currentMonth: closeMap.has(currentMonth),
        lastMonth: closeMap.has(lastMonth),
      },
    };
  }

  async exportTxCsv(filters: FinancialFactFilters, operatorUserId: string) {
    const projection = await this.readProjection(
      filters.from,
      filters.to,
      'CANONICAL',
    );
    const keyword = filters.keyword?.trim().toLowerCase();
    const facts = projection.facts.filter((fact) => {
      if (
        filters.categoryStableId &&
        fact.categoryStableId !== filters.categoryStableId
      ) {
        return false;
      }
      if (filters.source && fact.source !== filters.source) return false;
      if (!keyword) return true;
      return [
        fact.stableId,
        fact.memo,
        fact.categoryName,
        fact.accountName,
      ].some((value) => value?.toLowerCase().includes(keyword));
    });

    await this.createAuditLog({
      action: 'EXPORT',
      entityType: 'ACCOUNTING_REPORT',
      entityId: 'CANONICAL_FINANCIAL_FACTS',
      operatorActorRef: operatorUserId,
      afterJson: { count: facts.length, filters } as Prisma.JsonObject,
    });
    return renderAccountingFinancialFactsCsv(facts);
  }

  async exportPnlTemplate(
    template: 'MANAGEMENT' | 'BOSS',
    query: {
      from?: string;
      to?: string;
      groupBy?: 'month' | 'quarter' | 'year';
    },
    operatorUserId: string,
  ) {
    const report = await this.pnlReport(query);
    await this.createAuditLog({
      action: 'EXPORT_TEMPLATE',
      entityType: 'ACCOUNTING_REPORT',
      entityId: template,
      operatorActorRef: operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });
    return renderAccountingPnlCsv(template, report);
  }

  async exportPnlPdf(
    template: 'MANAGEMENT' | 'BOSS',
    query: {
      from?: string;
      to?: string;
      groupBy?: 'month' | 'quarter' | 'year';
    },
    operatorUserId: string,
  ) {
    const report = await this.pnlReport(query);
    const pdfBuffer = await renderAccountingPnlPdf(template, report);
    await this.createAuditLog({
      action: 'EXPORT_PDF',
      entityType: 'ACCOUNTING_REPORT',
      entityId: template,
      operatorActorRef: operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });
    return pdfBuffer;
  }

  async annualReport(year: number) {
    const startAt = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endAt = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const report = await this.pnlReport({
      from: startAt.toISOString(),
      to: endAt.toISOString(),
      groupBy: 'quarter',
    });
    return { year, quarters: report.periods, summary: report.summary };
  }

  async cashflowOverview(query: { from?: string; to?: string }) {
    const { fromDate, toDate } = await this.resolveRange(query.from, query.to);
    const occurredAt = this.occurredAtWhere(fromDate, toDate);
    const journalEntries = await this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        kind: {
          not: AccountingJournalEntryKind.OPENING_BALANCE,
        },
        ...(occurredAt ? { occurredAt } : {}),
      },
      select: {
        memo: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            memo: true,
            account: { select: { name: true, type: true } },
            category: { select: { name: true } },
          },
        },
      },
    });

    let operating = 0;
    let investing = 0;
    let financing = 0;
    const addMovement = (
      bucket: 'OPERATING' | 'INVESTING' | 'FINANCING',
      amountCents: number,
    ) => {
      if (bucket === 'INVESTING') investing += amountCents;
      else if (bucket === 'FINANCING') financing += amountCents;
      else operating += amountCents;
    };
    const isCashAccount = (type: AccountingAccountType | null) =>
      type === AccountingAccountType.CASH ||
      type === AccountingAccountType.BANK;

    for (const entry of journalEntries) {
      const cashMovementCents = entry.lines.reduce(
        (sum, line) =>
          isCashAccount(line.account.type)
            ? sum + line.debitCents - line.creditCents
            : sum,
        0,
      );
      if (cashMovementCents === 0) continue;
      addMovement(
        classifyAccountingCashflowContext([
          entry.memo,
          ...entry.lines.flatMap((line) => [
            line.memo,
            line.category?.name,
            line.account.name,
          ]),
        ]),
        cashMovementCents,
      );
    }

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      operatingCents: operating,
      investingCents: investing,
      financingCents: financing,
      netCashflowCents: operating + investing + financing,
    };
  }

  private async readProjection(
    from: string | undefined,
    to: string | undefined,
    scope: FinancialReportScope,
  ): Promise<AccountingFinancialReportProjection> {
    const { fromDate, toDate } = await this.resolveRange(from, to);
    const occurredAt = this.occurredAtWhere(fromDate, toDate);
    const journalEntries = await this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        ...(occurredAt ? { occurredAt } : {}),
      },
      select: {
        entryStableId: true,
        kind: true,
        source: true,
        sourceFactType: true,
        sourceFactVersion: true,
        occurredAt: true,
        currency: true,
        memo: true,
        createdAt: true,
        updatedAt: true,
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            lineNo: true,
            debitCents: true,
            creditCents: true,
            memo: true,
            account: {
              select: {
                accountStableId: true,
                name: true,
                type: true,
                accountClass: true,
                includeFundedExpensesInManagementReports: true,
              },
            },
            category: {
              select: { categoryStableId: true, name: true, type: true },
            },
          },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });

    const facts: AccountingFinancialReportFact[] = [];
    const adjustmentEffects: AccountingFinancialReportProjection['adjustmentEffects'] =
      [];
    let journalInputTaxCents = 0;
    for (const entry of journalEntries) {
      const projected = projectAccountingJournalReportEntry(entry);
      journalInputTaxCents += projected.journalInputTaxCents;
      if (
        scope === 'MANAGEMENT' &&
        !this.includeJournalEntryInManagementProjection(entry)
      ) {
        continue;
      }
      facts.push(...projected.facts);
      adjustmentEffects.push(...projected.adjustmentEffects);
    }
    const expenseInputTaxCents = 0;

    facts.sort((a, b) => {
      const occurredDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
      return occurredDiff || a.stableId.localeCompare(b.stableId);
    });
    adjustmentEffects.sort((a, b) => {
      const occurredDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
      return occurredDiff || a.stableId.localeCompare(b.stableId);
    });
    return {
      facts,
      adjustmentEffects,
      journalInputTaxCents,
      expenseInputTaxCents,
    };
  }

  private includeJournalEntryInManagementProjection(entry: {
    source: AccountingJournalSource;
    sourceFactType: string | null;
    sourceFactVersion: number | null;
    lines: Array<{
      creditCents: number;
      account: {
        type: AccountingAccountType | null;
        includeFundedExpensesInManagementReports: boolean | null;
      };
    }>;
  }): boolean {
    const isExpenseV2Group =
      entry.source === AccountingJournalSource.EXPENSE_DOCUMENT &&
      entry.sourceFactType === CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2 &&
      entry.sourceFactVersion === 2;
    if (!isExpenseV2Group) return true;

    const fundingLines = entry.lines.filter(
      (line) =>
        line.creditCents > 0 &&
        (line.account.type === AccountingAccountType.CASH ||
          line.account.type === AccountingAccountType.BANK ||
          line.account.type === AccountingAccountType.PLATFORM_WALLET),
    );
    if (fundingLines.length !== 1) {
      throw new BadRequestException(
        'Expense v2 Journal must have exactly one operational funding credit line',
      );
    }
    return (
      fundingLines[0].account.includeFundedExpensesInManagementReports !== false
    );
  }

  private async resolveRange(from?: string, to?: string) {
    const timezone =
      from || to ? await this.period.getBusinessTimezone() : undefined;
    return {
      fromDate: await this.period.clampAccountingFromDate(
        this.parseDate(from, false, timezone),
      ),
      toDate: this.parseDate(to, true, timezone),
    };
  }

  private occurredAtWhere(fromDate?: Date, toDate?: Date) {
    if (!fromDate && !toDate) return undefined;
    return {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  private parseDate(
    raw: string | undefined,
    endOfDay = false,
    timezone?: string,
  ) {
    if (!raw) return undefined;
    if (raw.length <= 10 && timezone) {
      const parsed = DateTime.fromISO(raw, { zone: timezone });
      if (!parsed.isValid || parsed.toISODate() !== raw) {
        throw new BadRequestException(`Invalid date: ${raw}`);
      }
      const bounded = endOfDay ? parsed.endOf('day') : parsed.startOf('day');
      return bounded.toUTC().toJSDate();
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    return parsed;
  }

  private async createAuditLog(params: {
    action: string;
    entityType: string;
    entityId: string;
    operatorActorRef: string;
    beforeJson?: Prisma.InputJsonValue | null;
    afterJson?: Prisma.InputJsonValue | null;
  }) {
    await writeAccountingAuditLog(this.prisma, params);
  }
}
