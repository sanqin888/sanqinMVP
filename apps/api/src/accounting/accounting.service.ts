import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import {
  AccountingDocumentStatus,
  AccountingSourceType,
  AccountingTxType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
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
  limit?: number;
  offset?: number;
  cursor?: string;
};

type AuditLogFilters = {
  entityType?: string;
  entityId?: string;
  operatorActorRef?: string;
  from?: string;
  to?: string;
};

type UpsertTxDto = {
  type: AccountingTxType;
  source: AccountingSourceType;
  amountCents: number;
  currency?: string;
  occurredAt: string;
  categoryStableId: string;
  accountStableId?: string | null;
  toAccountStableId?: string | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
  lastKnownUpdatedAt?: string;
};

const ACCOUNTING_TX_PUBLIC_SELECT = {
  txStableId: true,
  type: true,
  source: true,
  amountCents: true,
  taxCents: true,
  currency: true,
  occurredAt: true,
  idempotencyKey: true,
  externalRef: true,
  counterparty: true,
  memo: true,
  attachmentUrls: true,
  createdByUserStableId: true,
  updatedByUserStableId: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  deletedAt: true,
  category: {
    select: {
      categoryStableId: true,
      name: true,
      type: true,
      parent: { select: { categoryStableId: true } },
    },
  },
  account: {
    select: { accountStableId: true, name: true, type: true, currency: true },
  },
  toAccount: {
    select: { accountStableId: true, name: true, type: true, currency: true },
  },
} satisfies Prisma.AccountingTransactionSelect;

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

  private async validatePayload(
    payload: UpsertTxDto,
    db: AccountingDbClient = this.prisma,
  ) {
    if (!Number.isInteger(payload.amountCents)) {
      throw new BadRequestException('amountCents must be an integer');
    }
    if (payload.amountCents < 0) {
      throw new BadRequestException(
        'amountCents must be greater than or equal to 0',
      );
    }

    const occurredAt = this.parseDate(payload.occurredAt);
    if (!occurredAt) {
      throw new BadRequestException('occurredAt is required');
    }

    const category = await db.accountingCategory.findUnique({
      where: { categoryStableId: payload.categoryStableId },
      select: { id: true, isActive: true, type: true },
    });
    if (!category || !category.isActive) {
      throw new BadRequestException('categoryStableId is invalid');
    }

    if (
      payload.type !== AccountingTxType.TRANSFER &&
      payload.type !== category.type
    ) {
      throw new BadRequestException('type must match category type');
    }

    const accountStableId = payload.accountStableId?.trim() || null;
    const toAccountStableId = payload.toAccountStableId?.trim() || null;
    const [fromAccount, targetAccount] = await Promise.all([
      accountStableId
        ? db.accountingAccount.findUnique({
            where: { accountStableId },
            select: {
              id: true,
              accountStableId: true,
              currency: true,
              isActive: true,
            },
          })
        : Promise.resolve(null),
      toAccountStableId
        ? db.accountingAccount.findUnique({
            where: { accountStableId: toAccountStableId },
            select: {
              id: true,
              accountStableId: true,
              currency: true,
              isActive: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (accountStableId && (!fromAccount || !fromAccount.isActive)) {
      throw new BadRequestException('accountStableId is invalid');
    }
    if (toAccountStableId && (!targetAccount || !targetAccount.isActive)) {
      throw new BadRequestException('toAccountStableId is invalid');
    }

    if (payload.type === AccountingTxType.TRANSFER) {
      if (
        !accountStableId ||
        !toAccountStableId ||
        accountStableId === toAccountStableId
      ) {
        throw new BadRequestException(
          'TRANSFER requires different accountStableId and toAccountStableId',
        );
      }
    } else if (toAccountStableId) {
      throw new BadRequestException(
        'toAccountStableId is only allowed for TRANSFER',
      );
    }

    const currency =
      payload.currency?.trim().toUpperCase() ||
      fromAccount?.currency ||
      targetAccount?.currency ||
      'CAD';
    return {
      occurredAt,
      categoryId: category.id,
      accountId: fromAccount?.id ?? null,
      toAccountId: targetAccount?.id ?? null,
      currency,
      idempotencyKey: payload.idempotencyKey?.trim() || null,
      externalRef: payload.externalRef?.trim() || null,
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

  async createTx(payload: UpsertTxDto, operatorUserId: string) {
    const timezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const normalized = await this.validatePayload(payload, tx);
      await this.period.assertOnOrAfterAccountingStartDate(
        normalized.occurredAt,
        tx,
      );
      await this.period.assertEditableForPeriod(
        normalized.occurredAt,
        payload.type,
        tx,
        timezone,
      );

      if (normalized.idempotencyKey) {
        const existing = await tx.accountingTransaction.findUnique({
          where: { idempotencyKey: normalized.idempotencyKey },
          select: ACCOUNTING_TX_PUBLIC_SELECT,
        });
        if (existing) {
          return existing;
        }
      }

      const created = await tx.accountingTransaction.create({
        data: {
          type: payload.type,
          source: payload.source,
          amountCents: payload.amountCents,
          currency: normalized.currency,
          occurredAt: normalized.occurredAt,
          categoryId: normalized.categoryId,
          accountId: normalized.accountId,
          toAccountId: normalized.toAccountId,
          idempotencyKey: normalized.idempotencyKey,
          externalRef: normalized.externalRef,
          counterparty: payload.counterparty?.trim() || null,
          memo: payload.memo?.trim() || null,
          attachmentUrls: payload.attachmentUrls ?? [],
          createdByUserStableId: operatorUserId,
          updatedByUserStableId: operatorUserId,
        },
        select: ACCOUNTING_TX_PUBLIC_SELECT,
      });

      await this.createAuditLog(
        {
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          entityId: created.txStableId,
          operatorActorRef: operatorUserId,
          afterJson: created as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return created;
    });
  }

  async listTx(filters: TxFilters) {
    const normalizedLimit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const normalizedOffset = Math.max(filters.offset ?? 0, 0);

    return this.prisma.accountingTransaction.findMany({
      where: await this.buildWhere(filters),
      select: ACCOUNTING_TX_PUBLIC_SELECT,
      ...(filters.cursor
        ? {
            cursor: { txStableId: filters.cursor },
            skip: 1,
          }
        : {}),
      skip: normalizedOffset,
      take: normalizedLimit,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateTx(
    txStableId: string,
    payload: UpsertTxDto,
    operatorUserId: string,
  ) {
    const lastKnownUpdatedAt = payload.lastKnownUpdatedAt?.trim();
    if (!lastKnownUpdatedAt) {
      throw new BadRequestException('lastKnownUpdatedAt is required');
    }
    const expectedUpdatedAt = this.parseDate(lastKnownUpdatedAt);
    if (!expectedUpdatedAt) {
      throw new BadRequestException('Invalid lastKnownUpdatedAt');
    }
    const timezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingTransaction.findUnique({
        where: { txStableId },
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Transaction not found');
      }

      const normalized = await this.validatePayload(payload, tx);
      await this.period.assertOnOrAfterAccountingStartDate(
        existing.occurredAt,
        tx,
      );
      await this.period.assertOnOrAfterAccountingStartDate(
        normalized.occurredAt,
        tx,
      );
      await this.period.assertEditableForPeriod(
        existing.occurredAt,
        existing.type,
        tx,
        timezone,
      );
      await this.period.assertEditableForPeriod(
        normalized.occurredAt,
        payload.type,
        tx,
        timezone,
      );

      const updateResult = await tx.accountingTransaction.updateMany({
        where: {
          txStableId,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          type: payload.type,
          source: payload.source,
          amountCents: payload.amountCents,
          currency: normalized.currency,
          occurredAt: normalized.occurredAt,
          categoryId: normalized.categoryId,
          accountId: normalized.accountId,
          toAccountId: normalized.toAccountId,
          idempotencyKey: normalized.idempotencyKey,
          externalRef: normalized.externalRef,
          counterparty: payload.counterparty?.trim() || null,
          memo: payload.memo?.trim() || null,
          attachmentUrls: payload.attachmentUrls ?? [],
          updatedByUserStableId: operatorUserId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Transaction has been modified by another operation, please refresh and retry',
        );
      }

      const updated = await tx.accountingTransaction.findUnique({
        where: { txStableId },
        select: ACCOUNTING_TX_PUBLIC_SELECT,
      });

      if (!updated) {
        throw new NotFoundException('Transaction not found');
      }

      await this.createAuditLog(
        {
          action: 'UPDATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          entityId: txStableId,
          operatorActorRef: operatorUserId,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return updated;
    });
  }

  async deleteTx(txStableId: string, operatorUserId: string) {
    const timezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingTransaction.findUnique({
        where: { txStableId },
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Transaction not found');
      }

      await this.period.assertOnOrAfterAccountingStartDate(
        existing.occurredAt,
        tx,
      );
      await this.period.assertEditableForPeriod(
        existing.occurredAt,
        existing.type,
        tx,
        timezone,
      );

      const deleted = await tx.accountingTransaction.update({
        where: { txStableId },
        data: {
          deletedAt: new Date(),
          updatedByUserStableId: operatorUserId,
          version: { increment: 1 },
        },
      });

      await this.createAuditLog(
        {
          action: 'DELETE',
          entityType: 'ACCOUNTING_TRANSACTION',
          entityId: txStableId,
          operatorActorRef: operatorUserId,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: deleted as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return { ok: true };
    });
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
