import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingSourceType,
  AccountingTxType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxFilters = {
  from?: string;
  to?: string;
  categoryId?: string;
  source?: AccountingSourceType;
  keyword?: string;
};

type UpsertTxDto = {
  type: AccountingTxType;
  source: AccountingSourceType;
  amountCents: number;
  currency?: string;
  occurredAt: string;
  categoryId: string;
  orderId?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(raw: string | undefined, endOfDay = false): Date | undefined {
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

  private buildWhere(filters: TxFilters): Prisma.AccountingTransactionWhereInput {
    const fromDate = this.parseDate(filters.from);
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
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(keyword
        ? {
            OR: [
              { memo: { contains: keyword, mode: 'insensitive' } },
              { counterparty: { contains: keyword, mode: 'insensitive' } },
              { txStableId: { contains: keyword, mode: 'insensitive' } },
              { orderId: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async validatePayload(payload: UpsertTxDto) {
    if (!Number.isInteger(payload.amountCents)) {
      throw new BadRequestException('amountCents must be an integer');
    }

    const occurredAt = this.parseDate(payload.occurredAt);
    if (!occurredAt) {
      throw new BadRequestException('occurredAt is required');
    }

    const category = await this.prisma.accountingCategory.findUnique({
      where: { id: payload.categoryId },
      select: { id: true, isActive: true, type: true },
    });
    if (!category || !category.isActive) {
      throw new BadRequestException('categoryId is invalid');
    }

    if (payload.type !== category.type) {
      throw new BadRequestException('type must match category type');
    }

    const normalizedOrderId = payload.orderId?.trim() || null;
    if (payload.source === AccountingSourceType.ORDER) {
      if (!normalizedOrderId) {
        throw new BadRequestException('orderId is required when source=ORDER');
      }
      const order = await this.prisma.order.findUnique({
        where: { orderStableId: normalizedOrderId },
        select: { orderStableId: true },
      });
      if (!order) {
        throw new BadRequestException('orderId is invalid');
      }
    }

    return {
      occurredAt,
      orderId: normalizedOrderId,
      currency: payload.currency?.trim().toUpperCase() || 'CAD',
    };
  }

  private async createAuditLog(params: {
    action: string;
    entityType: string;
    entityId: string;
    operatorUserId: string;
    beforeJson?: Prisma.InputJsonValue | null;
    afterJson?: Prisma.InputJsonValue | null;
  }) {
    await this.prisma.accountingAuditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        operatorUserId: params.operatorUserId,
        beforeJson:
          params.beforeJson === null ? Prisma.JsonNull : params.beforeJson,
        afterJson:
          params.afterJson === null ? Prisma.JsonNull : params.afterJson,
      },
    });
  }

  async createTx(payload: UpsertTxDto, operatorUserId: string) {
    const normalized = await this.validatePayload(payload);

    const created = await this.prisma.accountingTransaction.create({
      data: {
        type: payload.type,
        source: payload.source,
        amountCents: payload.amountCents,
        currency: normalized.currency,
        occurredAt: normalized.occurredAt,
        categoryId: payload.categoryId,
        orderId: normalized.orderId,
        counterparty: payload.counterparty?.trim() || null,
        memo: payload.memo?.trim() || null,
        attachmentUrls: payload.attachmentUrls ?? [],
        createdByUserId: operatorUserId,
        updatedByUserId: operatorUserId,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
      },
    });

    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'ACCOUNTING_TRANSACTION',
      entityId: created.txStableId,
      operatorUserId,
      afterJson: created as unknown as Prisma.InputJsonValue,
    });

    return created;
  }

  async listTx(filters: TxFilters) {
    return this.prisma.accountingTransaction.findMany({
      where: this.buildWhere(filters),
      include: {
        category: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateTx(txStableId: string, payload: UpsertTxDto, operatorUserId: string) {
    const existing = await this.prisma.accountingTransaction.findUnique({
      where: { txStableId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Transaction not found');
    }

    const normalized = await this.validatePayload(payload);

    const updated = await this.prisma.accountingTransaction.update({
      where: { txStableId },
      data: {
        type: payload.type,
        source: payload.source,
        amountCents: payload.amountCents,
        currency: normalized.currency,
        occurredAt: normalized.occurredAt,
        categoryId: payload.categoryId,
        orderId: normalized.orderId,
        counterparty: payload.counterparty?.trim() || null,
        memo: payload.memo?.trim() || null,
        attachmentUrls: payload.attachmentUrls ?? [],
        updatedByUserId: operatorUserId,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
      },
    });

    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'ACCOUNTING_TRANSACTION',
      entityId: txStableId,
      operatorUserId,
      beforeJson: existing as unknown as Prisma.InputJsonValue,
      afterJson: updated as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }

  async deleteTx(txStableId: string, operatorUserId: string) {
    const existing = await this.prisma.accountingTransaction.findUnique({
      where: { txStableId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Transaction not found');
    }

    const deleted = await this.prisma.accountingTransaction.update({
      where: { txStableId },
      data: {
        deletedAt: new Date(),
        updatedByUserId: operatorUserId,
      },
    });

    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'ACCOUNTING_TRANSACTION',
      entityId: txStableId,
      operatorUserId,
      beforeJson: existing as unknown as Prisma.InputJsonValue,
      afterJson: deleted as unknown as Prisma.InputJsonValue,
    });

    return { ok: true };
  }

  async pnlReport(query: {
    from?: string;
    to?: string;
    groupBy?: 'month' | 'quarter' | 'year';
  }) {
    const groupBy = query.groupBy ?? 'month';
    const rows = await this.prisma.accountingTransaction.findMany({
      where: this.buildWhere({ from: query.from, to: query.to }),
      select: {
        txStableId: true,
        type: true,
        source: true,
        amountCents: true,
        occurredAt: true,
        categoryId: true,
        category: { select: { name: true, type: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });

    const getBucket = (date: Date) => {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      if (groupBy === 'year') return `${year}`;
      if (groupBy === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
      return `${year}-${month.toString().padStart(2, '0')}`;
    };

    const periods = new Map<string, { income: number; expense: number; adjustment: number }>();
    const categories = new Map<string, { categoryId: string; categoryName: string; type: AccountingTxType; amountCents: number }>();
    const sources = new Map<AccountingSourceType, number>();

    for (const row of rows) {
      const bucket = getBucket(row.occurredAt);
      const period = periods.get(bucket) ?? { income: 0, expense: 0, adjustment: 0 };
      if (row.type === AccountingTxType.INCOME) period.income += row.amountCents;
      if (row.type === AccountingTxType.EXPENSE) period.expense += row.amountCents;
      if (row.type === AccountingTxType.ADJUSTMENT) period.adjustment += row.amountCents;
      periods.set(bucket, period);

      const categoryKey = row.categoryId;
      const cat = categories.get(categoryKey) ?? {
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? 'Unknown',
        type: row.category?.type ?? row.type,
        amountCents: 0,
      };
      cat.amountCents += row.amountCents;
      categories.set(categoryKey, cat);

      sources.set(row.source, (sources.get(row.source) ?? 0) + row.amountCents);
    }

    const totals = Array.from(periods.values()).reduce(
      (acc, item) => {
        acc.income += item.income;
        acc.expense += item.expense;
        acc.adjustment += item.adjustment;
        return acc;
      },
      { income: 0, expense: 0, adjustment: 0 },
    );

    return {
      groupBy,
      from: query.from ?? null,
      to: query.to ?? null,
      summary: {
        incomeCents: totals.income,
        expenseCents: totals.expense,
        adjustmentCents: totals.adjustment,
        netProfitCents: totals.income - totals.expense + totals.adjustment,
      },
      periods: Array.from(periods.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([period, val]) => ({
          period,
          incomeCents: val.income,
          expenseCents: val.expense,
          adjustmentCents: val.adjustment,
          netProfitCents: val.income - val.expense + val.adjustment,
        })),
      byCategory: Array.from(categories.values()).sort((a, b) => b.amountCents - a.amountCents),
      bySource: Array.from(sources.entries()).map(([source, amountCents]) => ({ source, amountCents })),
    };
  }

  async exportTxCsv(filters: TxFilters, operatorUserId: string) {
    const rows = await this.prisma.accountingTransaction.findMany({
      where: this.buildWhere(filters),
      include: {
        category: { select: { name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });

    await this.createAuditLog({
      action: 'EXPORT',
      entityType: 'ACCOUNTING_TRANSACTION',
      entityId: 'BATCH',
      operatorUserId,
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
      'orderId',
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
        row.orderId,
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

  async listCategories() {
    return this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
