import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AccountingSourceType,
  AccountingTxType,
  Prisma,
  SettlementPlatform,
  OrderStatus,
  Channel,
  PaymentMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  operatorUserId?: string;
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
  orderId?: string | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
  lastKnownUpdatedAt?: string;
};

type AutoAccrualDto = {
  date: string;
  categoryStableId: string;
  accountStableId?: string;
  mode?: 'DAILY' | 'PER_ORDER';
};

const ACCOUNTING_TX_PUBLIC_SELECT = {
  txStableId: true,
  type: true,
  source: true,
  amountCents: true,
  taxCents: true,
  currency: true,
  occurredAt: true,
  orderId: true,
  idempotencyKey: true,
  externalRef: true,
  counterparty: true,
  memo: true,
  attachmentUrls: true,
  createdByUserId: true,
  updatedByUserId: true,
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

@Injectable()
export class AccountingService {
  private static readonly DEFAULT_BUSINESS_TIMEZONE = 'America/Toronto';

  constructor(private readonly prisma: PrismaService) {}

  private async getBusinessTimezone(): Promise<string> {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
      select: { timezone: true },
    });
    return (
      config?.timezone?.trim() || AccountingService.DEFAULT_BUSINESS_TIMEZONE
    );
  }

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

  private toPeriodKey(date: Date, timezone: string): string {
    const zoned = DateTime.fromJSDate(date, { zone: timezone });
    if (!zoned.isValid) {
      throw new BadRequestException(
        `Invalid occurredAt for timezone ${timezone}`,
      );
    }
    const year = zoned.year;
    const month = `${zoned.month}`.padStart(2, '0');
    return `${year}-${month}`;
  }

  private monthBounds(periodKey: string, timezone: string) {
    const parsed = /^(\d{4})-(\d{2})$/.exec(periodKey);
    if (!parsed) {
      throw new BadRequestException('periodKey must use YYYY-MM format');
    }
    const year = Number(parsed[1]);
    const month = Number(parsed[2]);
    const start = DateTime.fromObject(
      { year, month, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      { zone: timezone },
    );
    if (!start.isValid) {
      throw new BadRequestException(`Invalid periodKey: ${periodKey}`);
    }

    const end = start.endOf('month');
    const startAt = start.toUTC().toJSDate();
    const endAt = end.toUTC().toJSDate();
    return { startAt, endAt };
  }

  private yearBounds(periodKey: string, timezone: string) {
    if (!/^\d{4}$/.test(periodKey)) {
      throw new BadRequestException('periodKey must use YYYY format');
    }
    const year = Number(periodKey);
    const start = DateTime.fromObject(
      { year, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      { zone: timezone },
    );
    if (!start.isValid) {
      throw new BadRequestException(`Invalid periodKey: ${periodKey}`);
    }
    return {
      startAt: start.toUTC().toJSDate(),
      endAt: start.endOf('year').toUTC().toJSDate(),
    };
  }

  async assertEditableForPeriod(
    occurredAt: Date,
    type: AccountingTxType,
  ) {
    const timezone = await this.getBusinessTimezone();
    const zoned = DateTime.fromJSDate(occurredAt, { zone: timezone });
    if (!zoned.isValid) {
      throw new BadRequestException('Invalid accounting occurredAt');
    }
    const yearKey = `${zoned.year}`;
    const yearLocked = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: {
          periodType: 'YEAR',
          periodKey: yearKey,
        },
      },
      select: { id: true },
    });
    if (yearLocked) {
      throw new ForbiddenException(
        `财年 ${yearKey} 已硬锁账，不允许修改历史分录。`,
      );
    }

    const periodKey = this.toPeriodKey(occurredAt, timezone);
    const monthClosed = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey,
        },
      },
      select: { id: true },
    });

    if (!monthClosed) return;
    if (type !== AccountingTxType.ADJUSTMENT) {
      throw new ForbiddenException(
        `期间 ${periodKey} 已月结；可先重新打开月份，或使用 ADJUSTMENT 调整。`,
      );
    }
  }

  private buildWhere(
    filters: TxFilters,
  ): Prisma.AccountingTransactionWhereInput {
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
              { orderId: { contains: keyword, mode: 'insensitive' } },
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
      ...(filters.operatorUserId
        ? { operatorUserId: filters.operatorUserId }
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

  private async validatePayload(payload: UpsertTxDto) {
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

    const category = await this.prisma.accountingCategory.findUnique({
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
        ? this.prisma.accountingAccount.findUnique({
            where: { accountStableId },
            select: { id: true, accountStableId: true, currency: true, isActive: true },
          })
        : Promise.resolve(null),
      toAccountStableId
        ? this.prisma.accountingAccount.findUnique({
            where: { accountStableId: toAccountStableId },
            select: { id: true, accountStableId: true, currency: true, isActive: true },
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

    const currency =
      payload.currency?.trim().toUpperCase() ||
      fromAccount?.currency ||
      targetAccount?.currency ||
      'CAD';
    return {
      occurredAt,
      orderId: normalizedOrderId,
      categoryId: category.id,
      accountId: fromAccount?.id ?? null,
      toAccountId: targetAccount?.id ?? null,
      currency,
      idempotencyKey: payload.idempotencyKey?.trim() || null,
      externalRef: payload.externalRef?.trim() || null,
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
    await this.assertEditableForPeriod(normalized.occurredAt, payload.type);

    if (normalized.idempotencyKey) {
      const existing = await this.prisma.accountingTransaction.findUnique({
        where: { idempotencyKey: normalized.idempotencyKey },
        select: ACCOUNTING_TX_PUBLIC_SELECT,
      });
      if (existing) {
        return existing;
      }
    }

    const created = await this.prisma.accountingTransaction.create({
      data: {
        type: payload.type,
        source: payload.source,
        amountCents: payload.amountCents,
        currency: normalized.currency,
        occurredAt: normalized.occurredAt,
        categoryId: normalized.categoryId,
        accountId: normalized.accountId,
        toAccountId: normalized.toAccountId,
        orderId: normalized.orderId,
        idempotencyKey: normalized.idempotencyKey,
        externalRef: normalized.externalRef,
        counterparty: payload.counterparty?.trim() || null,
        memo: payload.memo?.trim() || null,
        attachmentUrls: payload.attachmentUrls ?? [],
        createdByUserId: operatorUserId,
        updatedByUserId: operatorUserId,
      },
      select: ACCOUNTING_TX_PUBLIC_SELECT,
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
    const normalizedLimit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const normalizedOffset = Math.max(filters.offset ?? 0, 0);

    return this.prisma.accountingTransaction.findMany({
      where: this.buildWhere(filters),
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

    const existing = await this.prisma.accountingTransaction.findUnique({
      where: { txStableId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Transaction not found');
    }

    const normalized = await this.validatePayload(payload);
    await this.assertEditableForPeriod(existing.occurredAt, existing.type);
    await this.assertEditableForPeriod(normalized.occurredAt, payload.type);

    const updateResult = await this.prisma.accountingTransaction.updateMany({
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
        orderId: normalized.orderId,
        idempotencyKey: normalized.idempotencyKey,
        externalRef: normalized.externalRef,
        counterparty: payload.counterparty?.trim() || null,
        memo: payload.memo?.trim() || null,
        attachmentUrls: payload.attachmentUrls ?? [],
        updatedByUserId: operatorUserId,
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Transaction has been modified by another operation, please refresh and retry',
      );
    }

    const updated = await this.prisma.accountingTransaction.findUnique({
      where: { txStableId },
      select: ACCOUNTING_TX_PUBLIC_SELECT,
    });

    if (!updated) {
      throw new NotFoundException('Transaction not found');
    }

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

    await this.assertEditableForPeriod(existing.occurredAt, existing.type);

    const deleted = await this.prisma.accountingTransaction.update({
      where: { txStableId },
      data: {
        deletedAt: new Date(),
        updatedByUserId: operatorUserId,
        version: { increment: 1 },
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

  async closeMonth(periodKey: string, operatorUserId: string) {
    const timezone = await this.getBusinessTimezone();
    const { startAt, endAt } = this.monthBounds(periodKey, timezone);
    const yearKey = periodKey.slice(0, 4);
    const yearLocked = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: { periodType: 'YEAR', periodKey: yearKey },
      },
      select: { id: true },
    });
    if (yearLocked) {
      throw new ConflictException(`财年 ${yearKey} 已硬锁账`);
    }

    const close = await this.prisma.accountingPeriodClose.upsert({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey,
        },
      },
      create: {
        periodType: 'MONTH',
        periodKey,
        startAt,
        endAt,
        closedByUserId: operatorUserId,
      },
      update: {
        startAt,
        endAt,
        closedByUserId: operatorUserId,
        closedAt: new Date(),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
    });

    await this.createAuditLog({
      action: 'PERIOD_CLOSE',
      entityType: 'ACCOUNTING_PERIOD',
      entityId: periodKey,
      operatorUserId,
      afterJson: close as unknown as Prisma.InputJsonValue,
    });

    return close;
  }

  async reopenMonth(periodKey: string, operatorUserId: string) {
    const timezone = await this.getBusinessTimezone();
    this.monthBounds(periodKey, timezone);
    const yearKey = periodKey.slice(0, 4);
    const yearLocked = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: { periodType: 'YEAR', periodKey: yearKey },
      },
      select: { id: true },
    });
    if (yearLocked) {
      throw new ForbiddenException(`财年 ${yearKey} 已硬锁账，月份不能重新打开`);
    }
    const existing = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: { periodType: 'MONTH', periodKey },
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
    });
    if (!existing) return { reopened: false, periodKey };

    await this.prisma.accountingPeriodClose.delete({
      where: {
        periodType_periodKey: { periodType: 'MONTH', periodKey },
      },
    });
    await this.createAuditLog({
      action: 'PERIOD_REOPEN',
      entityType: 'ACCOUNTING_PERIOD',
      entityId: periodKey,
      operatorUserId,
      beforeJson: existing as unknown as Prisma.InputJsonValue,
    });
    return { reopened: true, periodKey };
  }

  async closeYear(periodKey: string, operatorUserId: string) {
    const timezone = await this.getBusinessTimezone();
    const { startAt, endAt } = this.yearBounds(periodKey, timezone);
    const requiredMonths = Array.from(
      { length: 12 },
      (_, index) => `${periodKey}-${String(index + 1).padStart(2, '0')}`,
    );
    const monthRows = await this.prisma.accountingPeriodClose.findMany({
      where: { periodType: 'MONTH', periodKey: { in: requiredMonths } },
      select: { periodKey: true },
    });
    const closedMonths = new Set(monthRows.map((row) => row.periodKey));
    const missingMonths = requiredMonths.filter((month) => !closedMonths.has(month));
    if (missingMonths.length) {
      throw new ConflictException(
        `年度硬锁前必须完成12个月月结；未月结：${missingMonths.join(', ')}`,
      );
    }

    const close = await this.prisma.accountingPeriodClose.upsert({
      where: {
        periodType_periodKey: { periodType: 'YEAR', periodKey },
      },
      create: {
        periodType: 'YEAR',
        periodKey,
        startAt,
        endAt,
        closedByUserId: operatorUserId,
      },
      update: {
        startAt,
        endAt,
        closedByUserId: operatorUserId,
        closedAt: new Date(),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
    });
    await this.createAuditLog({
      action: 'YEAR_LOCK',
      entityType: 'ACCOUNTING_PERIOD',
      entityId: periodKey,
      operatorUserId,
      afterJson: close as unknown as Prisma.InputJsonValue,
    });
    return close;
  }

  async listPeriodCloseStatus(periodKeys?: string[]) {
    return this.prisma.accountingPeriodClose.findMany({
      where: {
        periodType: 'MONTH',
        ...(periodKeys?.length ? { periodKey: { in: periodKeys } } : {}),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
      orderBy: { periodKey: 'asc' },
    });
  }

  async listYearCloseStatus(years?: string[]) {
    return this.prisma.accountingPeriodClose.findMany({
      where: {
        periodType: 'YEAR',
        ...(years?.length ? { periodKey: { in: years } } : {}),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
      orderBy: { periodKey: 'asc' },
    });
  }

  async pnlReport(query: {
    from?: string;
    to?: string;
    groupBy?: 'month' | 'quarter' | 'year';
  }) {
    const groupBy = query.groupBy ?? 'month';
    const timezone = await this.getBusinessTimezone();
    const rows = await this.prisma.accountingTransaction.findMany({
      where: this.buildWhere({ from: query.from, to: query.to }),
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

      const monthKey = this.toPeriodKey(row.occurredAt, timezone);
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
    const currentMonth = this.toPeriodKey(now, timezone);
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
      (await this.listPeriodCloseStatus(monthPeriods)).map((row) => [
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
      where: this.buildWhere(filters),
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
      'account',
      'toAccount',
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
        row.account?.name ?? '',
        row.toAccount?.name ?? '',
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
      operatorUserId,
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
      operatorUserId,
      afterJson: { template, query } as Prisma.JsonObject,
    });

    return Buffer.from(pdf, 'utf8');
  }

  async autoAccrueOrderRevenue(
    payload: AutoAccrualDto,
    operatorUserId: string,
  ) {
    const runDate = this.parseDate(payload.date);
    if (!runDate) throw new BadRequestException('date is required');
    const startAt = new Date(runDate);
    startAt.setHours(0, 0, 0, 0);
    const endAt = new Date(runDate);
    endAt.setHours(23, 59, 59, 999);

    const category = await this.prisma.accountingCategory.findUnique({
      where: { categoryStableId: payload.categoryStableId },
      select: { id: true, type: true, isActive: true },
    });
    if (
      !category ||
      !category.isActive ||
      category.type !== AccountingTxType.INCOME
    ) {
      throw new BadRequestException(
        'categoryStableId must be an active INCOME category',
      );
    }

    const mode = payload.mode ?? 'DAILY';
    const orders = await this.prisma.order.findMany({
      where: {
        paidAt: { gte: startAt, lte: endAt },
        status: {
          in: [
            OrderStatus.paid,
            OrderStatus.making,
            OrderStatus.ready,
            OrderStatus.completed,
          ],
        },
      },
      select: {
        orderStableId: true,
        totalCents: true,
        paidAt: true,
        channel: true,
        paymentMethod: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    if (!orders.length) {
      return {
        mode,
        date: payload.date,
        created: 0,
        skipped: 0,
        amountCents: 0,
      };
    }

    if (mode === 'DAILY') {
      const idempotencyKey = `AUTO_ORDER_DAILY:${payload.date}`;
      const existing = await this.prisma.accountingTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return {
          mode,
          date: payload.date,
          created: 0,
          skipped: orders.length,
          amountCents: 0,
        };
      }
      const amountCents = orders.reduce(
        (sum, item) => sum + item.totalCents,
        0,
      );
      await this.createTx(
        {
          type: AccountingTxType.INCOME,
          source: AccountingSourceType.ORDER,
          amountCents,
          occurredAt: startAt.toISOString(),
          categoryStableId: payload.categoryStableId,
          accountStableId: payload.accountStableId,
          orderId: orders[0].orderStableId,
          idempotencyKey,
          memo: `自动入账 ${payload.date}（${orders.length} 单）`,
        },
        operatorUserId,
      );
      return {
        mode,
        date: payload.date,
        created: 1,
        skipped: 0,
        amountCents,
        orderCount: orders.length,
      };
    }

    let created = 0;
    let skipped = 0;
    let amountCents = 0;
    for (const order of orders) {
      const idempotencyKey = `AUTO_ORDER:${order.orderStableId}`;
      const source =
        order.paymentMethod === PaymentMethod.UBEREATS ||
        order.channel === Channel.ubereats
          ? AccountingSourceType.UBER
          : AccountingSourceType.ORDER;
      const existing = await this.prisma.accountingTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await this.createTx(
        {
          type: AccountingTxType.INCOME,
          source,
          amountCents: order.totalCents,
          occurredAt: order.paidAt.toISOString(),
          categoryStableId: payload.categoryStableId,
          accountStableId: payload.accountStableId,
          orderId: order.orderStableId,
          idempotencyKey,
          memo: `订单自动入账 ${order.orderStableId}`,
        },
        operatorUserId,
      );
      created += 1;
      amountCents += order.totalCents;
    }
    return {
      mode,
      date: payload.date,
      created,
      skipped,
      amountCents,
      orderCount: orders.length,
    };
  }

  async importPlatformSettlementCsv(payload: {
    platform: SettlementPlatform;
    csv: string;
    importBatchId?: string;
  }) {
    const importBatchId =
      payload.importBatchId?.trim() || `BATCH-${Date.now()}`;
    const lines = payload.csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      throw new BadRequestException('csv must include header and data rows');
    }

    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
    const col = (name: string) => headers.indexOf(name);
    const orderIdCol = col('orderid');
    const grossCol = col('grosscents');
    const commissionCol = col('commissioncents');
    const netCol = col('netcents');
    const payoutAtCol = col('payoutat');
    if (
      [orderIdCol, grossCol, commissionCol, netCol, payoutAtCol].some(
        (v) => v < 0,
      )
    ) {
      throw new BadRequestException(
        'csv header must contain orderId,grossCents,commissionCents,netCents,payoutAt',
      );
    }

    const data = dataLines.map((line, index) => {
      const cols = line.split(',').map((x) => x.trim());
      const payoutAt = new Date(cols[payoutAtCol]);
      if (Number.isNaN(payoutAt.getTime())) {
        throw new BadRequestException(`invalid payoutAt at line ${index + 2}`);
      }
      return {
        platform: payload.platform,
        importBatchId,
        externalRowId: `${index + 1}`,
        orderId: cols[orderIdCol] || null,
        grossCents: Number(cols[grossCol]),
        commissionCents: Number(cols[commissionCol]),
        netCents: Number(cols[netCol]),
        payoutAt,
        rawPayload: { line },
      };
    });

    await this.prisma.platformSettlementRecord.createMany({
      data,
      skipDuplicates: true,
    });
    return { importBatchId, count: data.length };
  }

  async reconcilePlatform(
    platform: SettlementPlatform,
    from?: string,
    to?: string,
  ) {
    const fromDate = this.parseDate(from);
    const toDate = this.parseDate(to, true);
    const settlements = await this.prisma.platformSettlementRecord.findMany({
      where: {
        platform,
        ...(fromDate || toDate
          ? {
              payoutAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { payoutAt: 'asc' },
    });

    const orderIds = settlements
      .map((s) => s.orderId)
      .filter((x): x is string => Boolean(x));
    const txRows = orderIds.length
      ? await this.prisma.accountingTransaction.findMany({
          where: { orderId: { in: orderIds }, deletedAt: null },
          select: { orderId: true, amountCents: true, source: true },
        })
      : [];
    const txMap = new Map(txRows.map((row) => [row.orderId as string, row]));

    const diffs = settlements.flatMap((item) => {
      const issues: Array<{
        type: string;
        orderId: string | null;
        message: string;
      }> = [];
      const tx = item.orderId ? txMap.get(item.orderId) : undefined;
      if (!item.orderId || !tx) {
        issues.push({
          type: '缺单',
          orderId: item.orderId,
          message: '平台结算存在，但未找到订单收入分录',
        });
      } else if (tx.amountCents !== item.grossCents) {
        issues.push({
          type: '金额差',
          orderId: item.orderId,
          message: `订单收入=${tx.amountCents}, 平台毛收入=${item.grossCents}`,
        });
      }
      if (item.netCents < 0) {
        issues.push({
          type: '退款未同步',
          orderId: item.orderId,
          message: '平台净额为负，需确认退款分录',
        });
      }
      return issues;
    });

    return {
      platform,
      from: from ?? null,
      to: to ?? null,
      settlementCount: settlements.length,
      diffCount: diffs.length,
      diffs,
    };
  }

  async accountBalanceReport(from?: string, to?: string) {
    const fromDate = this.parseDate(from);
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
          const item = upsert(row.toAccount.accountStableId, row.toAccount.name);
          item.inflowCents += row.amountCents;
          item.balanceChangeCents += row.amountCents;
        }
        continue;
      }
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
    const fromDate = this.parseDate(query.from);
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
    const fromDate = this.parseDate(query.from);
    const toDate = this.parseDate(query.to, true);
    const orders = await this.prisma.order.findMany({
      where: {
        paidAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      },
      select: {
        totalCents: true,
        channel: true,
        paymentMethod: true,
      },
    });
    const byChannel = new Map<string, number>();
    const byPayment = new Map<string, number>();
    for (const item of orders) {
      byChannel.set(
        item.channel,
        (byChannel.get(item.channel) ?? 0) + item.totalCents,
      );
      byPayment.set(
        item.paymentMethod,
        (byPayment.get(item.paymentMethod) ?? 0) + item.totalCents,
      );
    }
    return {
      from: query.from ?? null,
      to: query.to ?? null,
      byChannel: Array.from(byChannel.entries()).map(([key, amountCents]) => ({
        key,
        amountCents,
      })),
      byPaymentMethod: Array.from(byPayment.entries()).map(
        ([key, amountCents]) => ({ key, amountCents }),
      ),
    };
  }

  async listAuditLogs(filters: AuditLogFilters) {
    return this.prisma.accountingAuditLog.findMany({
      where: this.buildAuditWhere(filters),
      select: {
        action: true,
        entityType: true,
        entityId: true,
        beforeJson: true,
        afterJson: true,
        operatorUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listCategories() {
    return this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
