import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingSourceType, AccountingTxType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxFilters = {
  from?: string;
  to?: string;
  categoryId?: string;
  source?: AccountingSourceType;
  keyword?: string;
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
  categoryId: string;
  orderId?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

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

  private toPeriodKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }

  private monthBounds(periodKey: string) {
    const parsed = /^(\d{4})-(\d{2})$/.exec(periodKey);
    if (!parsed) {
      throw new BadRequestException('periodKey must use YYYY-MM format');
    }
    const year = Number(parsed[1]);
    const month = Number(parsed[2]) - 1;
    const startAt = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endAt = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    return { startAt, endAt };
  }

  private async assertEditableForPeriod(
    occurredAt: Date,
    type: AccountingTxType,
  ) {
    const periodKey = this.toPeriodKey(occurredAt);
    const closed = await this.prisma.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey,
        },
      },
      select: { id: true },
    });

    if (!closed) return;
    if (type !== AccountingTxType.ADJUSTMENT) {
      throw new ForbiddenException(
        `期间 ${periodKey} 已锁账，仅允许新增或维护 ADJUSTMENT 分录。`,
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
    await this.assertEditableForPeriod(normalized.occurredAt, payload.type);

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
        category: {
          select: { id: true, name: true, type: true, parentId: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateTx(
    txStableId: string,
    payload: UpsertTxDto,
    operatorUserId: string,
  ) {
    const existing = await this.prisma.accountingTransaction.findUnique({
      where: { txStableId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Transaction not found');
    }

    const normalized = await this.validatePayload(payload);
    await this.assertEditableForPeriod(existing.occurredAt, existing.type);
    await this.assertEditableForPeriod(normalized.occurredAt, payload.type);

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

    await this.assertEditableForPeriod(existing.occurredAt, existing.type);

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

  async closeMonth(periodKey: string, operatorUserId: string) {
    const { startAt, endAt } = this.monthBounds(periodKey);

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

  async listPeriodCloseStatus(periodKeys?: string[]) {
    const rows = await this.prisma.accountingPeriodClose.findMany({
      where: {
        periodType: 'MONTH',
        ...(periodKeys?.length ? { periodKey: { in: periodKeys } } : {}),
      },
      orderBy: { periodKey: 'asc' },
    });
    return rows;
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
        category: {
          select: { id: true, name: true, type: true, parentId: true },
        },
      },
      orderBy: { occurredAt: 'asc' },
    });

    const categoriesMeta = await this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, parentId: true },
    });

    const getBucket = (date: Date) => {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      if (groupBy === 'year') return `${year}`;
      if (groupBy === 'quarter')
        return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
      return `${year}-${month.toString().padStart(2, '0')}`;
    };

    const periods = new Map<
      string,
      { income: number; expense: number; adjustment: number }
    >();
    const categories = new Map<
      string,
      {
        categoryId: string;
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
      };
      if (row.type === AccountingTxType.INCOME)
        period.income += row.amountCents;
      if (row.type === AccountingTxType.EXPENSE)
        period.expense += row.amountCents;
      if (row.type === AccountingTxType.ADJUSTMENT)
        period.adjustment += row.amountCents;
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

      const monthKey = this.toPeriodKey(row.occurredAt);
      const monthNet =
        row.type === AccountingTxType.INCOME
          ? row.amountCents
          : row.type === AccountingTxType.EXPENSE
            ? -row.amountCents
            : row.amountCents;
      monthNetMap.set(monthKey, (monthNetMap.get(monthKey) ?? 0) + monthNet);
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

    const categoryNodeMap = new Map(
      categoriesMeta.map((item) => [
        item.id,
        {
          categoryId: item.id,
          categoryName: item.name,
          type: item.type,
          parentId: item.parentId,
          amountCents: categories.get(item.id)?.amountCents ?? 0,
        },
      ]),
    );
    for (const node of categoryNodeMap.values()) {
      let parentId = node.parentId;
      while (parentId) {
        const parent = categoryNodeMap.get(parentId);
        if (!parent) break;
        parent.amountCents += node.amountCents;
        parentId = parent.parentId;
      }
    }

    const now = new Date();
    const currentMonth = this.toPeriodKey(now);
    const lastMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const lastMonth = this.toPeriodKey(lastMonthDate);
    const currentQuarterStart = new Date(
      Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1),
    );
    const quarterMonths = [0, 1, 2].map((offset) =>
      this.toPeriodKey(
        new Date(
          Date.UTC(
            currentQuarterStart.getUTCFullYear(),
            currentQuarterStart.getUTCMonth() + offset,
            1,
          ),
        ),
      ),
    );

    const periodRows = Array.from(periods.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, val]) => ({
        period,
        incomeCents: val.income,
        expenseCents: val.expense,
        adjustmentCents: val.adjustment,
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
        netProfitCents: totals.income - totals.expense + totals.adjustment,
      },
      periods: markedPeriods,
      byCategory: Array.from(categories.values()).sort(
        (a, b) => b.amountCents - a.amountCents,
      ),
      byCategoryTree: Array.from(categoryNodeMap.values())
        .sort((a, b) => b.amountCents - a.amountCents)
        .map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          type: item.type,
          parentId: item.parentId,
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

  async listAuditLogs(filters: AuditLogFilters) {
    return this.prisma.accountingAuditLog.findMany({
      where: this.buildAuditWhere(filters),
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
