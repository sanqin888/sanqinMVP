import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import {
  AccountingDocumentStatus,
  AccountingSourceType,
  AccountingTxType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingPeriodService } from './accounting-period.service';
import {
  ORDER_REPORTING_FACTS_READER,
  type OrderReportingFactsReaderPort,
} from '../orders/public-api';

type TxFilters = {
  from?: string;
  to?: string;
  categoryStableId?: string;
  source?: AccountingSourceType;
  keyword?: string;
};

type AuditLogFilters = {
  entityType?: string;
  entityId?: string;
  operatorActorRef?: string;
  from?: string;
  to?: string;
};

type AccountingDbClient = AccountingDb | Prisma.TransactionClient;

@Injectable()
export class AccountingService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    @Inject(ORDER_REPORTING_FACTS_READER)
    private readonly orderReportingFacts: OrderReportingFactsReaderPort,
  ) {}

  private parseDate(
    raw: string | undefined,
    endOfDay = false,
  ): Date | undefined {
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    if (raw.length <= 10) {
      if (endOfDay) {
        date.setHours(23, 59, 59, 999);
      } else {
        date.setHours(0, 0, 0, 0);
      }
    }
    return date;
  }

  private async buildWhere(
    filters: TxFilters,
  ): Promise<Prisma.AccountingTransactionWhereInput> {
    const fromDate = await this.period.clampAccountingFromDate(
      this.parseDate(filters.from),
    );
    const toDate = this.parseDate(filters.to, true);

    const occurredAt =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    const keyword = filters.keyword?.trim();
    return {
      deletedAt: null,
      ...(occurredAt ? { occurredAt } : {}),
      ...(filters.categoryStableId
        ? { category: { categoryStableId: filters.categoryStableId } }
        : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(keyword
        ? {
            OR: [
              { memo: { contains: keyword, mode: 'insensitive' } },
              { counterparty: { contains: keyword, mode: 'insensitive' } },
              { txStableId: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildAuditWhere(
    filters: AuditLogFilters,
  ): Prisma.AccountingAuditLogWhereInput {
    const fromDate = this.parseDate(filters.from);
    const toDate = this.parseDate(filters.to, true);

    return {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.operatorActorRef
        ? { operatorActorRef: filters.operatorActorRef }
        : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };
  }

  private async createAuditLog(
    params: {
      action: string;
      entityType: string;
      entityId: string;
      operatorActorRef: string;
      beforeJson?: Prisma.InputJsonValue | null;
      afterJson?: Prisma.InputJsonValue | null;
    },
    db: AccountingDbClient = this.prisma,
  ) {
    await writeAccountingAuditLog(db, params);
  }

  async pnlReport(query: {
    from?: string;
    to?: string;
    groupBy?: 'month' | 'quarter' | 'year';
  }) {
    const groupBy = query.groupBy ?? 'month';
    const timezone = await this.period.getBusinessTimezone();
    const rows = await this.prisma.accountingTransaction.findMany({
      where: await this.buildWhere({ from: query.from, to: query.to }),
      select: {
        txStableId: true,
        type: true,
        source: true,
        amountCents: true,
        occurredAt: true,
        category: {
          select: {
            categoryStableId: true,
            name: true,
            type: true,
            parent: { select: { categoryStableId: true } },
          },
        },
      },
      orderBy: { occurredAt: 'asc' },
    });

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
      const year = zoned.year;
      const month = zoned.month;
      if (groupBy === 'year') return `${year}`;
      if (groupBy === 'quarter')
        return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
      return `${year}-${month.toString().padStart(2, '0')}`;
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
    const sources = new Map<AccountingSourceType, number>();
    const monthNetMap = new Map<string, number>();

    for (const row of rows) {
      const bucket = getBucket(row.occurredAt);
      const period = periods.get(bucket) ?? {
        income: 0,
        expense: 0,
        adjustment: 0,
        transfer: 0,
      };
      if (row.type === AccountingTxType.INCOME)
        period.income += row.amountCents;
      if (row.type === AccountingTxType.EXPENSE)
        period.expense += row.amountCents;
      if (row.type === AccountingTxType.ADJUSTMENT)
        period.adjustment += row.amountCents;
      if (row.type === AccountingTxType.TRANSFER)
        period.transfer += row.amountCents;
      periods.set(bucket, period);

      const categoryKey = row.category.categoryStableId;
      const cat = categories.get(categoryKey) ?? {
        categoryStableId: row.category.categoryStableId,
        categoryName: row.category.name,
        type: row.category.type,
        amountCents: 0,
      };
      cat.amountCents += row.amountCents;
      categories.set(categoryKey, cat);

      sources.set(row.source, (sources.get(row.source) ?? 0) + row.amountCents);

      const monthKey = this.period.toPeriodKey(row.occurredAt, timezone);
      const monthNet =
        row.type === AccountingTxType.INCOME
          ? row.amountCents
          : row.type === AccountingTxType.EXPENSE
            ? -row.amountCents
            : row.type === AccountingTxType.ADJUSTMENT
              ? row.amountCents
              : 0;
      monthNetMap.set(monthKey, (monthNetMap.get(monthKey) ?? 0) + monthNet);
    }

    const totals = Array.from(periods.values()).reduce(
      (acc, item) => {
        acc.income += item.income;
        acc.expense += item.expense;
        acc.adjustment += item.adjustment;
        acc.transfer += item.transfer;
        return acc;
      },
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

    const now = new Date();
    const nowInTimezone = DateTime.fromJSDate(now, { zone: timezone });
    if (!nowInTimezone.isValid) {
      throw new BadRequestException(`Invalid now for timezone ${timezone}`);
    }
    const currentMonth = this.period.toPeriodKey(now, timezone);
    const lastMonth = `${nowInTimezone
      .minus({ months: 1 })
      .toFormat('yyyy-MM')}`;
    const currentQuarterStart = nowInTimezone.startOf('quarter');
    const quarterMonths = [0, 1, 2].map((offset) =>
      currentQuarterStart.plus({ months: offset }).toFormat('yyyy-MM'),
    );

    const periodRows = Array.from(periods.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, val]) => ({
        period,
        incomeCents: val.income,
        expenseCents: val.expense,
        adjustmentCents: val.adjustment,
        transferCents: val.transfer,
        netProfitCents: val.income - val.expense + val.adjustment,
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

    const markedPeriods = periodRows.map((item) => ({
      ...item,
      isClosed: closeMap.has(item.period),
    }));

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
      periods: markedPeriods,
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

  async exportTxCsv(filters: TxFilters, operatorUserId: string) {
    const rows = await this.prisma.accountingTransaction.findMany({
      where: await this.buildWhere(filters),
      include: {
        category: { select: { name: true } },
        account: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });

    await this.createAuditLog({
      action: 'EXPORT',
      entityType: 'ACCOUNTING_TRANSACTION',
      entityId: 'BATCH',
      operatorActorRef: operatorUserId,
      afterJson: {
        count: rows.length,
        filters,
      } as Prisma.JsonObject,
    });

    const escapeCsv = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = [
      'txStableId',
      'type',
      'source',
      'amountCents',
      'currency',
      'occurredAt',
      'category',
      'account',
      'toAccount',
      'counterparty',
      'memo',
      'createdAt',
      'updatedAt',
    ];

    const lines = rows.map((row) =>
      [
        row.txStableId,
        row.type,
        row.source,
        row.amountCents,
        row.currency,
        row.occurredAt.toISOString(),
        row.category?.name ?? '',
        row.account?.name ?? '',
        row.toAccount?.name ?? '',
        row.counterparty,
        row.memo,
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
      ]
        .map((value) => escapeCsv(value))
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
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

    const escapeCsv = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const formatMoney = (cents: number) => (cents / 100).toFixed(2);

    const lines: string[] = [];
    if (template === 'MANAGEMENT') {
      lines.push(
        [
          'period',
          'income',
          'expense',
          'adjustment',
          'netProfit',
          'isClosed',
        ].join(','),
      );
      for (const row of report.periods) {
        lines.push(
          [
            row.period,
            formatMoney(row.incomeCents),
            formatMoney(row.expenseCents),
            formatMoney(row.adjustmentCents),
            formatMoney(row.netProfitCents),
            row.isClosed ? 'CLOSED' : 'OPEN',
          ]
            .map(escapeCsv)
            .join(','),
        );
      }
      lines.push('');
      lines.push(['category', 'type', 'amount'].join(','));
      for (const row of report.byCategoryTree) {
        lines.push(
          [row.categoryName, row.type, formatMoney(row.amountCents)]
            .map(escapeCsv)
            .join(','),
        );
      }
    } else {
      lines.push(['metric', 'amount'].join(','));
      lines.push(
        ['收入', formatMoney(report.summary.incomeCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['费用', formatMoney(report.summary.expenseCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['调整', formatMoney(report.summary.adjustmentCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['净利润', formatMoney(report.summary.netProfitCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['本月净利润', formatMoney(report.trends.currentMonthNetCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['上月净利润', formatMoney(report.trends.lastMonthNetCents)]
          .map(escapeCsv)
          .join(','),
      );
      lines.push(
        ['季度累计净利润', formatMoney(report.trends.quarterToDateNetCents)]
          .map(escapeCsv)
          .join(','),
      );
    }

    await this.createAuditLog({
      action: 'EXPORT_TEMPLATE',
      entityType: 'ACCOUNTING_REPORT',
      entityId: template,
      operatorActorRef: operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });

    return lines.join('\n');
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
    const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    const textLines =
      template === 'MANAGEMENT'
        ? [
            `模板: 管理版（明细）`,
            `收入: ${formatMoney(report.summary.incomeCents)}`,
            `费用: ${formatMoney(report.summary.expenseCents)}`,
            `调整: ${formatMoney(report.summary.adjustmentCents)}`,
            `净利润: ${formatMoney(report.summary.netProfitCents)}`,
            ...report.periods
              .slice(0, 12)
              .map(
                (item) =>
                  `${item.period} | ${formatMoney(item.netProfitCents)} | ${item.isClosed ? '已锁账' : '未锁账'}`,
              ),
          ]
        : [
            `模板: 老板版（摘要）`,
            `净利润: ${formatMoney(report.summary.netProfitCents)}`,
            `本月: ${formatMoney(report.trends.currentMonthNetCents)}`,
            `上月: ${formatMoney(report.trends.lastMonthNetCents)}`,
            `季度累计: ${formatMoney(report.trends.quarterToDateNetCents)}`,
          ];

    const objects: string[] = [];
    const escapedText = textLines
      .map(
        (line, index) =>
          `${50} ${780 - index * 22} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj`,
      )
      .join(' T* ');
    const contentStream = `BT /F1 12 Tf ${escapedText} ET`;

    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
    objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj');
    objects.push(
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    );
    objects.push(
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    );
    objects.push(
      `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`,
    );

    let pdf = '%PDF-1.4\n';
    const xref: number[] = [0];
    for (const object of objects) {
      xref.push(pdf.length);
      pdf += `${object}\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${xref.length}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < xref.length; i += 1) {
      pdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    await this.createAuditLog({
      action: 'EXPORT_PDF',
      entityType: 'ACCOUNTING_REPORT',
      entityId: template,
      operatorActorRef: operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });

    return Buffer.from(pdf, 'utf8');
  }

  async accountBalanceReport(from?: string, to?: string) {
    const fromDate = await this.period.clampAccountingFromDate(
      this.parseDate(from),
    );
    const toDate = this.parseDate(to, true);
    const txRows = await this.prisma.accountingTransaction.findMany({
      where: {
        deletedAt: null,
        ...(fromDate || toDate
          ? {
              occurredAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      include: {
        account: {
          select: { accountStableId: true, name: true, type: true },
        },
        toAccount: {
          select: { accountStableId: true, name: true, type: true },
        },
      },
    });
    const expensePaymentAllocations =
      await this.prisma.accountingExpensePaymentAllocation.findMany({
        where: {
          expenseDocument: {
            status: AccountingDocumentStatus.CONFIRMED,
            ...(fromDate || toDate
              ? {
                  occurredAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
          },
        },
        select: {
          amountCents: true,
          account: {
            select: { accountStableId: true, name: true },
          },
        },
      });

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

    for (const row of txRows) {
      if (row.type === AccountingTxType.TRANSFER) {
        if (row.account) {
          const item = upsert(row.account.accountStableId, row.account.name);
          item.outflowCents += row.amountCents;
          item.balanceChangeCents -= row.amountCents;
        }
        if (row.toAccount) {
          const item = upsert(
            row.toAccount.accountStableId,
            row.toAccount.name,
          );
          item.inflowCents += row.amountCents;
          item.balanceChangeCents += row.amountCents;
        }
        continue;
      }
      if (row.type === AccountingTxType.EXPENSE && row.documentId) continue;
      if (!row.account) continue;
      const item = upsert(row.account.accountStableId, row.account.name);
      if (row.type === AccountingTxType.EXPENSE) {
        const paidCents = row.amountCents + row.taxCents;
        item.outflowCents += paidCents;
        item.balanceChangeCents -= paidCents;
      } else {
        item.inflowCents += row.amountCents;
        item.balanceChangeCents += row.amountCents;
      }
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
    const fromDate = await this.period.clampAccountingFromDate(
      this.parseDate(query.from),
    );
    const toDate = this.parseDate(query.to, true);
    const txRows = await this.prisma.accountingTransaction.findMany({
      where: {
        deletedAt: null,
        ...(fromDate || toDate
          ? {
              occurredAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: {
        amountCents: true,
        taxCents: true,
        type: true,
        category: { select: { name: true } },
      },
    });

    let operating = 0;
    let investing = 0;
    let financing = 0;
    for (const row of txRows) {
      const name = row.category?.name ?? '';
      const cashAmountCents =
        row.type === AccountingTxType.EXPENSE
          ? row.amountCents + row.taxCents
          : row.amountCents;
      const sign = row.type === AccountingTxType.EXPENSE ? -1 : 1;
      if (/投资|invest/i.test(name)) investing += cashAmountCents * sign;
      else if (/融资|loan|equity/i.test(name))
        financing += cashAmountCents * sign;
      else if (row.type !== AccountingTxType.TRANSFER)
        operating += cashAmountCents * sign;
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

  async dimensionSlice(query: { from?: string; to?: string }) {
    const timezone = await this.period.getBusinessTimezone();
    const parseStoreBoundary = (
      raw: string | undefined,
      boundary: 'start' | 'end',
    ): Date | undefined => {
      if (!raw) return undefined;
      const parsed = DateTime.fromISO(raw, { zone: timezone });
      if (!parsed.isValid) {
        throw new BadRequestException(`Invalid date: ${raw}`);
      }
      const bounded =
        boundary === 'start' ? parsed.startOf('day') : parsed.endOf('day');
      return bounded.toUTC().toJSDate();
    };

    const fromDate = await this.period.clampAccountingFromDate(
      parseStoreBoundary(query.from, 'start'),
    );
    const toDate = parseStoreBoundary(query.to, 'end');
    const dimensions =
      await this.orderReportingFacts.readPaidTotalDimensionsForRange(
        fromDate,
        toDate,
      );
    return {
      from: query.from ?? null,
      to: query.to ?? null,
      ...dimensions,
    };
  }

  async listAuditLogs(filters: AuditLogFilters) {
    const rows = await this.prisma.accountingAuditLog.findMany({
      where: this.buildAuditWhere(filters),
      select: {
        action: true,
        entityType: true,
        entityId: true,
        beforeJson: true,
        afterJson: true,
        operatorActorRef: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(({ operatorActorRef, ...row }) => ({
      ...row,
      // Preserve the current Web/PWA read contract until the planned 8B cleanup.
      operatorUserId: operatorActorRef,
    }));
  }

  async listCategories() {
    return this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
