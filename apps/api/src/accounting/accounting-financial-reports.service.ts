import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  AccountingAccountType,
  AccountingDocumentStatus,
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
  projectAccountingExpenseReportSplit,
  projectAccountingJournalReportEntry,
  type AccountingFinancialReportFact,
  type AccountingFinancialReportProjection,
} from './accounting-financial-report-policy';
import { countAccountingInboxReviewItems } from './accounting-inbox-query';
import { AccountingPeriodService } from './accounting-period.service';

type FinancialFactFilters = {
  from?: string;
  to?: string;
  categoryStableId?: string;
  source?: string;
  keyword?: string;
};

@Injectable()
export class AccountingFinancialReportsService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async dashboard(from: string, to: string) {
    const projection = await this.readProjection(from, to);
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
    const projection = await this.readProjection(query.from, query.to);
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

    const totals = Array.from(periods.values()).reduce(
      (acc, item) => ({
        income: acc.income + item.income,
        expense: acc.expense + item.expense,
        adjustment: acc.adjustment + item.adjustment,
        transfer: acc.transfer + item.transfer,
      }),
      { income: 0, expense: 0, adjustment: 0, transfer: 0 },
    );

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
    const projection = await this.readProjection(filters.from, filters.to);
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
    await this.createAuditLog({
      action: 'EXPORT_PDF',
      entityType: 'ACCOUNTING_REPORT',
      entityId: template,
      operatorActorRef: operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });
    return renderAccountingPnlPdf(template, report);
  }

  async accountBalanceReport(from?: string, to?: string) {
    const { fromDate, toDate } = await this.resolveRange(from, to);
    const occurredAt = this.occurredAtWhere(fromDate, toDate);
    const [journalLines, expensePaymentAllocations] = await Promise.all([
      this.prisma.accountingJournalLine.findMany({
        where: {
          entry: {
            deletedAt: null,
            source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
            ...(occurredAt ? { occurredAt } : {}),
          },
        },
        select: {
          debitCents: true,
          creditCents: true,
          account: {
            select: { accountStableId: true, name: true, type: true },
          },
        },
      }),
      this.prisma.accountingExpensePaymentAllocation.findMany({
        where: {
          expenseDocument: {
            status: AccountingDocumentStatus.CONFIRMED,
            ...(occurredAt ? { occurredAt } : {}),
          },
        },
        select: {
          amountCents: true,
          account: { select: { accountStableId: true, name: true } },
        },
      }),
    ]);

    const summary = new Map<
      string,
      {
        accountStableId: string;
        accountName: string;
        inflowCents: number;
        outflowCents: number;
        balanceChangeCents: number;
      }
    >();
    const upsert = (accountStableId: string, name: string) => {
      const existing = summary.get(accountStableId) ?? {
        accountStableId,
        accountName: name,
        inflowCents: 0,
        outflowCents: 0,
        balanceChangeCents: 0,
      };
      summary.set(accountStableId, existing);
      return existing;
    };

    for (const line of journalLines) {
      if (!line.account.type) continue;
      const item = upsert(line.account.accountStableId, line.account.name);
      item.inflowCents += line.debitCents;
      item.outflowCents += line.creditCents;
      item.balanceChangeCents += line.debitCents - line.creditCents;
    }
    for (const allocation of expensePaymentAllocations) {
      const item = upsert(
        allocation.account.accountStableId,
        allocation.account.name,
      );
      item.outflowCents += allocation.amountCents;
      item.balanceChangeCents -= allocation.amountCents;
    }

    return Array.from(summary.values()).sort(
      (a, b) => b.balanceChangeCents - a.balanceChangeCents,
    );
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
    const [journalEntries, expensePaymentAllocations] = await Promise.all([
      this.prisma.accountingJournalEntry.findMany({
        where: {
          deletedAt: null,
          source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
          kind: {
            notIn: [
              AccountingJournalEntryKind.TRANSFER,
              AccountingJournalEntryKind.OPENING_BALANCE,
            ],
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
      }),
      this.prisma.accountingExpensePaymentAllocation.findMany({
        where: {
          expenseDocument: {
            status: AccountingDocumentStatus.CONFIRMED,
            ...(occurredAt ? { occurredAt } : {}),
          },
        },
        select: {
          amountCents: true,
          account: { select: { name: true, type: true } },
          expenseDocument: {
            select: {
              memo: true,
              transactions: {
                where: { deletedAt: null },
                select: {
                  memo: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

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

    for (const allocation of expensePaymentAllocations) {
      if (!isCashAccount(allocation.account.type)) continue;
      addMovement(
        classifyAccountingCashflowContext([
          allocation.expenseDocument.memo,
          allocation.account.name,
          ...allocation.expenseDocument.transactions.flatMap((transaction) => [
            transaction.memo,
            transaction.category.name,
          ]),
        ]),
        -allocation.amountCents,
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
    from?: string,
    to?: string,
  ): Promise<AccountingFinancialReportProjection> {
    const { fromDate, toDate } = await this.resolveRange(from, to);
    const occurredAt = this.occurredAtWhere(fromDate, toDate);
    const [journalEntries, expenseRows] = await Promise.all([
      this.prisma.accountingJournalEntry.findMany({
        where: {
          deletedAt: null,
          source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
          ...(occurredAt ? { occurredAt } : {}),
        },
        select: {
          entryStableId: true,
          kind: true,
          source: true,
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
                },
              },
              category: {
                select: { categoryStableId: true, name: true, type: true },
              },
            },
          },
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.accountingTransaction.findMany({
        where: {
          deletedAt: null,
          type: AccountingTxType.EXPENSE,
          document: { status: AccountingDocumentStatus.CONFIRMED },
          ...(occurredAt ? { occurredAt } : {}),
        },
        select: {
          txStableId: true,
          amountCents: true,
          taxCents: true,
          occurredAt: true,
          currency: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { categoryStableId: true, name: true, type: true },
          },
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const facts: AccountingFinancialReportFact[] = [];
    let journalInputTaxCents = 0;
    let expenseInputTaxCents = 0;
    for (const entry of journalEntries) {
      const projected = projectAccountingJournalReportEntry(entry);
      facts.push(...projected.facts);
      journalInputTaxCents += projected.journalInputTaxCents;
    }
    for (const row of expenseRows) {
      const projected = projectAccountingExpenseReportSplit(row);
      facts.push(...projected.facts);
      expenseInputTaxCents += projected.expenseInputTaxCents;
    }

    facts.sort((a, b) => {
      const occurredDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
      return occurredDiff || a.stableId.localeCompare(b.stableId);
    });
    return { facts, journalInputTaxCents, expenseInputTaxCents };
  }

  private async resolveRange(from?: string, to?: string) {
    return {
      fromDate: await this.period.clampAccountingFromDate(this.parseDate(from)),
      toDate: this.parseDate(to, true),
    };
  }

  private occurredAtWhere(fromDate?: Date, toDate?: Date) {
    if (!fromDate && !toDate) return undefined;
    return {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  private parseDate(raw: string | undefined, endOfDay = false) {
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    if (raw.length <= 10) {
      if (endOfDay) parsed.setHours(23, 59, 59, 999);
      else parsed.setHours(0, 0, 0, 0);
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
