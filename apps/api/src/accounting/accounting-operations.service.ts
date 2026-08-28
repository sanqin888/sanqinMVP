import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingSourceType,
  AccountingTxType,
  Prisma,
} from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsAccountingDir } from '../common/utils/uploads-path';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';

export type AccountingExpenseSplitInput = {
  categoryStableId: string;
  amountCents: number;
  taxCents?: number;
};

export type AccountingExpenseInput = {
  occurredAt: string;
  totalCents: number;
  accountStableId?: string | null;
  attachmentUrls?: string[];
  memo?: string | null;
  splits: AccountingExpenseSplitInput[];
};

const DEFAULT_CATEGORY_TREE = [
  {
    stableId: 'expense_food',
    name: '食材',
    type: AccountingTxType.EXPENSE,
    children: [
      ['expense_food_meat', '肉类'],
      ['expense_food_vegetable', '蔬菜'],
      ['expense_food_staple', '主食原料'],
      ['expense_food_seasoning', '调味品'],
      ['expense_food_beverage', '饮料'],
      ['expense_food_other', '其他食材'],
    ],
  },
  {
    stableId: 'expense_store_operations',
    name: '门店运营',
    type: AccountingTxType.EXPENSE,
    children: [
      ['expense_packaging', '包装耗材'],
      ['expense_cleaning', '清洁用品'],
      ['expense_office', '办公用品'],
      ['expense_kitchen_supplies', '厨房用品'],
      ['expense_repair', '设备维修'],
    ],
  },
  {
    stableId: 'expense_fixed_operations',
    name: '固定/经营费用',
    type: AccountingTxType.EXPENSE,
    children: [
      ['expense_rent', '房租'],
      ['expense_utilities', '水电燃气'],
      ['expense_labor', '人工'],
      ['expense_insurance', '保险'],
      ['expense_marketing', '广告营销'],
      ['expense_professional', '专业服务'],
      ['expense_telecom', '网络通讯'],
      ['expense_software', '软件订阅'],
    ],
  },
  {
    stableId: 'expense_platform_delivery',
    name: '平台及配送',
    type: AccountingTxType.EXPENSE,
    children: [
      ['expense_platform_fee', '平台佣金'],
      ['expense_delivery', '配送费用'],
    ],
  },
  {
    stableId: 'expense_other',
    name: '其他支出',
    type: AccountingTxType.EXPENSE,
    children: [],
  },
  {
    stableId: 'income_sales',
    name: '餐品销售',
    type: AccountingTxType.INCOME,
    children: [],
  },
  {
    stableId: 'income_delivery',
    name: '配送收入',
    type: AccountingTxType.INCOME,
    children: [],
  },
  {
    stableId: 'income_other',
    name: '其他收入',
    type: AccountingTxType.INCOME,
    children: [],
  },
  {
    stableId: 'adjustment_general',
    name: '会计调整',
    type: AccountingTxType.ADJUSTMENT,
    children: [],
  },
  {
    stableId: 'transfer_internal',
    name: '账户转账',
    type: AccountingTxType.TRANSFER,
    children: [],
  },
] as const;

const ACCOUNTING_DOCUMENT_SELECT = {
  documentStableId: true,
  source: true,
  status: true,
  occurredAt: true,
  subtotalCents: true,
  taxCents: true,
  totalCents: true,
  currency: true,
  emailSubject: true,
  attachmentUrls: true,
  extractionJson: true,
  memo: true,
  createdAt: true,
  confirmedAt: true,
  account: {
    select: {
      accountStableId: true,
      name: true,
    },
  },
  transactions: {
    where: { deletedAt: null },
    select: {
      txStableId: true,
      amountCents: true,
      taxCents: true,
      category: {
        select: { categoryStableId: true, name: true },
      },
    },
  },
} satisfies Prisma.AccountingExpenseDocumentSelect;

type AccountingDocumentRow = Prisma.AccountingExpenseDocumentGetPayload<{
  select: typeof ACCOUNTING_DOCUMENT_SELECT;
}>;

@Injectable()
export class AccountingOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async initializeDefaults() {
    for (let rootIndex = 0; rootIndex < DEFAULT_CATEGORY_TREE.length; rootIndex += 1) {
      const root = DEFAULT_CATEGORY_TREE[rootIndex];
      const parent = await this.prisma.accountingCategory.upsert({
        where: { categoryStableId: root.stableId },
        create: {
          categoryStableId: root.stableId,
          name: root.name,
          type: root.type,
          sortOrder: rootIndex * 100,
        },
        update: {},
        select: { id: true },
      });

      for (let childIndex = 0; childIndex < root.children.length; childIndex += 1) {
        const [categoryStableId, name] = root.children[childIndex];
        await this.prisma.accountingCategory.upsert({
          where: { categoryStableId },
          create: {
            categoryStableId,
            name,
            type: root.type,
            parentId: parent.id,
            sortOrder: rootIndex * 100 + childIndex + 1,
          },
          update: {},
        });
      }
    }

    const accountDefaults = [
      { accountStableId: 'account_store_cash', name: '门店现金', type: 'CASH' as const },
      {
        accountStableId: 'account_clover_pending',
        name: 'Clover 待结算',
        type: 'PLATFORM_WALLET' as const,
      },
      {
        accountStableId: 'account_uber_pending',
        name: 'Uber Eats 待结算',
        type: 'PLATFORM_WALLET' as const,
      },
    ];
    for (const account of accountDefaults) {
      await this.prisma.accountingAccount.upsert({
        where: { accountStableId: account.accountStableId },
        create: account,
        update: {},
      });
    }

    return {
      categories: await this.listCategories(),
      accounts: await this.listAccounts(),
    };
  }

  async listCategories(includeInactive = false) {
    const rows = await this.prisma.accountingCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      select: {
        categoryStableId: true,
        name: true,
        type: true,
        isActive: true,
        sortOrder: true,
        parent: { select: { categoryStableId: true } },
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      categoryStableId: row.categoryStableId,
      name: row.name,
      type: row.type,
      isActive: row.isActive,
      parentStableId: row.parent?.categoryStableId ?? null,
      sortOrder: row.sortOrder,
    }));
  }

  async createCategory(input: {
    name: string;
    type: AccountingTxType;
    parentStableId?: string | null;
    sortOrder?: number;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name is required');
    const duplicate = await this.prisma.accountingCategory.findFirst({
      where: { name, type: input.type },
      select: { categoryStableId: true },
    });
    if (duplicate) {
      throw new ConflictException('category name already exists for this type');
    }
    const parent = input.parentStableId
      ? await this.prisma.accountingCategory.findUnique({
          where: { categoryStableId: input.parentStableId },
          select: { id: true, type: true, isActive: true },
        })
      : null;
    if (input.parentStableId && (!parent || !parent.isActive)) {
      throw new BadRequestException('parentStableId is invalid');
    }
    if (parent && parent.type !== input.type) {
      throw new BadRequestException('parent category type must match category type');
    }
    const created = await this.prisma.accountingCategory.create({
      data: {
        categoryStableId: `category_${createId()}`,
        name,
        type: input.type,
        parentId: parent?.id ?? null,
        sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder! : 0,
      },
      select: { categoryStableId: true },
    });
    return this.getCategory(created.categoryStableId);
  }

  async updateCategory(
    categoryStableId: string,
    input: {
      name?: string;
      parentStableId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.accountingCategory.findUnique({
      where: { categoryStableId },
      select: {
        id: true,
        type: true,
        parent: { select: { isActive: true } },
      },
    });
    if (!existing) throw new NotFoundException('category not found');

    let parentId: string | null | undefined;
    if (input.parentStableId !== undefined) {
      if (input.parentStableId === null || input.parentStableId === '') {
        parentId = null;
      } else {
        if (input.parentStableId === categoryStableId) {
          throw new BadRequestException('category cannot be its own parent');
        }
        const parent = await this.prisma.accountingCategory.findUnique({
          where: { categoryStableId: input.parentStableId },
          select: { id: true, type: true, isActive: true },
        });
        if (!parent || !parent.isActive) {
          throw new BadRequestException('parentStableId is invalid');
        }
        if (parent.type !== existing.type) {
          throw new BadRequestException('parent category type must match category type');
        }
        const createsCycle = await this.categoryHasDescendant(
          categoryStableId,
          input.parentStableId,
        );
        if (createsCycle) {
          throw new BadRequestException('category parent would create a cycle');
        }
        parentId = parent.id;
      }
    }

    if (input.isActive === false) {
      const activeChildren = await this.prisma.accountingCategory.count({
        where: { parentId: existing.id, isActive: true },
      });
      if (activeChildren > 0) {
        throw new ConflictException('deactivate active child categories first');
      }
    }

    const name = input.name === undefined ? undefined : input.name.trim();
    if (name !== undefined && !name) {
      throw new BadRequestException('name cannot be empty');
    }
    if (name !== undefined) {
      const duplicate = await this.prisma.accountingCategory.findFirst({
        where: {
          name,
          type: existing.type,
          NOT: { categoryStableId },
        },
        select: { categoryStableId: true },
      });
      if (duplicate) {
        throw new ConflictException('category name already exists for this type');
      }
    }
    if (
      input.isActive === true &&
      input.parentStableId === undefined &&
      existing.parent &&
      !existing.parent.isActive
    ) {
      throw new ConflictException('activate the parent category first');
    }
    if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
      throw new BadRequestException('sortOrder must be an integer');
    }

    await this.prisma.accountingCategory.update({
      where: { categoryStableId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return this.getCategory(categoryStableId);
  }

  private async getCategory(categoryStableId: string) {
    const row = await this.prisma.accountingCategory.findUnique({
      where: { categoryStableId },
      select: {
        categoryStableId: true,
        name: true,
        type: true,
        isActive: true,
        sortOrder: true,
        parent: { select: { categoryStableId: true } },
      },
    });
    if (!row) throw new NotFoundException('category not found');
    return {
      categoryStableId: row.categoryStableId,
      name: row.name,
      type: row.type,
      isActive: row.isActive,
      parentStableId: row.parent?.categoryStableId ?? null,
      sortOrder: row.sortOrder,
    };
  }

  private async categoryHasDescendant(
    categoryStableId: string,
    candidateDescendantStableId: string,
  ) {
    let cursor: string | null = candidateDescendantStableId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === categoryStableId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const row = await this.prisma.accountingCategory.findUnique({
        where: { categoryStableId: cursor },
        select: { parentId: true },
      });
      if (!row?.parentId) {
        cursor = null;
        continue;
      }
      const parent = await this.prisma.accountingCategory.findUnique({
        where: { id: row.parentId },
        select: { categoryStableId: true },
      });
      cursor = parent?.categoryStableId ?? null;
    }
    return false;
  }

  async listAccounts() {
    return this.prisma.accountingAccount.findMany({
      where: { isActive: true },
      select: {
        accountStableId: true,
        name: true,
        type: true,
        currency: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createAccount(input: {
    name: string;
    type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
    currency?: string;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name is required');
    const created = await this.prisma.accountingAccount.create({
      data: {
        accountStableId: `account_${createId()}`,
        name,
        type: input.type,
        currency: input.currency?.trim().toUpperCase() || 'CAD',
      },
      select: {
        accountStableId: true,
        name: true,
        type: true,
        currency: true,
      },
    });
    return created;
  }

  async saveReceiptImage(file: { originalname: string; buffer: Buffer }) {
    const extension = this.detectReceiptImageExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException('Unsupported or invalid receipt image');
    }
    const originalExtension = path.extname(file.originalname).toLowerCase();
    const allowedOriginalExtensions =
      extension === '.jpg' ? new Set(['.jpg', '.jpeg']) : new Set([extension]);
    if (originalExtension && !allowedOriginalExtensions.has(originalExtension)) {
      throw new BadRequestException(
        'Receipt image extension does not match file type',
      );
    }
    const dir = path.join(getUploadsAccountingDir(), 'receipts');
    await fs.promises.mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}-${createId()}${extension}`;
    await fs.promises.writeFile(path.join(dir, fileName), file.buffer, {
      flag: 'wx',
    });
    return `/api/v1/accounting/files/receipts/${fileName}`;
  }

  async createExpense(input: AccountingExpenseInput, operatorUserStableId: string) {
    const occurredAt = this.parseDate(input.occurredAt);
    await this.accounting.assertEditableForPeriod(
      occurredAt,
      AccountingTxType.EXPENSE,
    );
    this.assertMoney(input.totalCents, 'totalCents');
    if (!input.splits.length) {
      throw new BadRequestException('at least one expense split is required');
    }

    const normalizedSplits = input.splits.map((split) => {
      this.assertMoney(split.amountCents, 'split.amountCents');
      const taxCents = split.taxCents ?? 0;
      this.assertMoney(taxCents, 'split.taxCents');
      return { ...split, taxCents };
    });
    const subtotalCents = normalizedSplits.reduce(
      (sum, split) => sum + split.amountCents,
      0,
    );
    const taxCents = normalizedSplits.reduce(
      (sum, split) => sum + split.taxCents,
      0,
    );
    if (subtotalCents + taxCents !== input.totalCents) {
      throw new BadRequestException(
        `expense does not balance: subtotal(${subtotalCents}) + tax(${taxCents}) != total(${input.totalCents})`,
      );
    }

    const categoryRows = await this.prisma.accountingCategory.findMany({
      where: {
        categoryStableId: {
          in: normalizedSplits.map((split) => split.categoryStableId),
        },
        isActive: true,
      },
      select: { id: true, categoryStableId: true, type: true },
    });
    const categoryMap = new Map(
      categoryRows.map((row) => [row.categoryStableId, row]),
    );
    for (const split of normalizedSplits) {
      const category = categoryMap.get(split.categoryStableId);
      if (!category || category.type !== AccountingTxType.EXPENSE) {
        throw new BadRequestException(
          `invalid EXPENSE categoryStableId: ${split.categoryStableId}`,
        );
      }
    }

    const account = input.accountStableId
      ? await this.prisma.accountingAccount.findUnique({
          where: { accountStableId: input.accountStableId },
          select: { id: true, currency: true, isActive: true },
        })
      : null;
    if (input.accountStableId && (!account || !account.isActive)) {
      throw new BadRequestException('accountStableId is invalid');
    }

    const attachmentUrls = this.normalizeUrls(input.attachmentUrls);
    const documentStableId = `expense_${createId()}`;
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accountingExpenseDocument.create({
        data: {
          documentStableId,
          source: AccountingDocumentSource.MANUAL,
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          currency: account?.currency ?? 'CAD',
          accountId: account?.id ?? null,
          attachmentUrls,
          memo: input.memo?.trim() || null,
          confirmedAt: new Date(),
          confirmedByUserId: operatorUserStableId,
        },
      });

      await tx.accountingTransaction.createMany({
        data: normalizedSplits.map((split, index) => ({
          txStableId: `accttx_${createId()}`,
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          currency: account?.currency ?? 'CAD',
          occurredAt,
          categoryId: categoryMap.get(split.categoryStableId)!.id,
          accountId: account?.id ?? null,
          documentId: created.id,
          idempotencyKey: `expense:${documentStableId}:${index}`,
          externalRef: documentStableId,
          memo: input.memo?.trim() || null,
          attachmentUrls,
          createdByUserId: operatorUserStableId,
          updatedByUserId: operatorUserStableId,
        })),
      });
      return created;
    });

    return this.getExpenseDocument(document.documentStableId);
  }

  async listExpenseDocuments(params: {
    status?: AccountingDocumentStatus;
    limit?: number;
  }) {
    const take = Math.min(Math.max(params.limit ?? 100, 1), 200);
    const rows = await this.prisma.accountingExpenseDocument.findMany({
      where: params.status ? { status: params.status } : undefined,
      select: ACCOUNTING_DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((row) => this.presentDocument(row));
  }

  async getExpenseDocument(documentStableId: string) {
    const row = await this.prisma.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: ACCOUNTING_DOCUMENT_SELECT,
    });
    if (!row) throw new NotFoundException('expense document not found');
    return this.presentDocument(row);
  }

  async confirmInboxDocument(
    documentStableId: string,
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    const existing = await this.prisma.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: { id: true, status: true, attachmentUrls: true },
    });
    if (!existing) throw new NotFoundException('expense document not found');
    if (existing.status === AccountingDocumentStatus.CONFIRMED) {
      throw new ConflictException('expense document is already confirmed');
    }

    const occurredAt = this.parseDate(input.occurredAt);
    await this.accounting.assertEditableForPeriod(
      occurredAt,
      AccountingTxType.EXPENSE,
    );
    this.assertMoney(input.totalCents, 'totalCents');
    if (!input.splits.length) {
      throw new BadRequestException('at least one expense split is required');
    }
    const normalizedSplits = input.splits.map((split) => {
      this.assertMoney(split.amountCents, 'split.amountCents');
      const taxCents = split.taxCents ?? 0;
      this.assertMoney(taxCents, 'split.taxCents');
      return { ...split, taxCents };
    });
    const subtotalCents = normalizedSplits.reduce(
      (sum, split) => sum + split.amountCents,
      0,
    );
    const taxCents = normalizedSplits.reduce(
      (sum, split) => sum + split.taxCents,
      0,
    );
    if (subtotalCents + taxCents !== input.totalCents) {
      throw new BadRequestException('expense splits do not match document total');
    }

    const categories = await this.prisma.accountingCategory.findMany({
      where: {
        categoryStableId: {
          in: normalizedSplits.map((split) => split.categoryStableId),
        },
        type: AccountingTxType.EXPENSE,
        isActive: true,
      },
      select: { id: true, categoryStableId: true },
    });
    const categoryMap = new Map(
      categories.map((row) => [row.categoryStableId, row.id]),
    );
    if (normalizedSplits.some((split) => !categoryMap.has(split.categoryStableId))) {
      throw new BadRequestException('one or more expense categories are invalid');
    }

    const account = input.accountStableId
      ? await this.prisma.accountingAccount.findUnique({
          where: { accountStableId: input.accountStableId },
          select: { id: true, currency: true, isActive: true },
        })
      : null;
    if (input.accountStableId && (!account || !account.isActive)) {
      throw new BadRequestException('accountStableId is invalid');
    }
    const attachmentUrls = Array.from(
      new Set([
        ...existing.attachmentUrls,
        ...this.normalizeUrls(input.attachmentUrls),
      ]),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.accountingTransaction.deleteMany({
        where: { documentId: existing.id, deletedAt: null },
      });
      await tx.accountingExpenseDocument.update({
        where: { id: existing.id },
        data: {
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          accountId: account?.id ?? null,
          currency: account?.currency ?? 'CAD',
          attachmentUrls,
          memo: input.memo?.trim() || null,
          confirmedAt: new Date(),
          confirmedByUserId: operatorUserStableId,
        },
      });
      await tx.accountingTransaction.createMany({
        data: normalizedSplits.map((split, index) => ({
          txStableId: `accttx_${createId()}`,
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          currency: account?.currency ?? 'CAD',
          occurredAt,
          categoryId: categoryMap.get(split.categoryStableId)!,
          accountId: account?.id ?? null,
          documentId: existing.id,
          idempotencyKey: `expense:${documentStableId}:${index}`,
          externalRef: documentStableId,
          memo: input.memo?.trim() || null,
          attachmentUrls,
          createdByUserId: operatorUserStableId,
          updatedByUserId: operatorUserStableId,
        })),
      });
    });

    return this.getExpenseDocument(documentStableId);
  }

  async dashboard(from: string, to: string) {
    const fromDate = this.parseDate(from);
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
    const expenseCategories = new Map<string, { name: string; amountCents: number }>();
    for (const row of rows) {
      taxCents += row.taxCents;
      if (row.type === AccountingTxType.INCOME) incomeCents += row.amountCents;
      if (row.type === AccountingTxType.EXPENSE) {
        expenseCents += row.amountCents;
        const previous = expenseCategories.get(row.category.categoryStableId) ?? {
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

    const pendingDocuments = await this.prisma.accountingExpenseDocument.count({
      where: { status: AccountingDocumentStatus.PENDING_REVIEW },
    });
    const latestClosedMonth = await this.prisma.accountingPeriodClose.findFirst({
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
        expenseDocuments: pendingDocuments,
      },
      topExpenseCategories: Array.from(expenseCategories.entries())
        .map(([categoryStableId, value]) => ({ categoryStableId, ...value }))
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 8),
      lastClosedMonth: latestClosedMonth?.periodKey ?? null,
    };
  }

  private presentDocument(row: AccountingDocumentRow) {
    return {
      documentStableId: row.documentStableId,
      source: row.source,
      status: row.status,
      occurredAt: row.occurredAt?.toISOString() ?? null,
      subtotalCents: row.subtotalCents,
      taxCents: row.taxCents,
      totalCents: row.totalCents,
      currency: row.currency,
      emailSubject: row.emailSubject,
      attachmentUrls: row.attachmentUrls,
      extraction: row.extractionJson,
      memo: row.memo,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      account: row.account,
      splits: row.transactions.map((tx) => ({
        txStableId: tx.txStableId,
        categoryStableId: tx.category.categoryStableId,
        categoryName: tx.category.name,
        amountCents: tx.amountCents,
        taxCents: tx.taxCents,
      })),
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

  private assertMoney(value: number, name: string) {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${name} must be a non-negative integer`);
    }
  }

  private detectReceiptImageExtension(
    buffer: Buffer,
  ): '.jpg' | '.png' | '.webp' | null {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return '.jpg';
    }
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (pngSignature.every((byte, index) => buffer[index] === byte)) {
      return '.png';
    }
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return '.webp';
    }
    return null;
  }

  private normalizeUrls(urls?: string[]) {
    return Array.from(
      new Set(
        (urls ?? [])
          .map((value) => value.trim())
          .filter((value) => value.startsWith('/api/v1/accounting/files/')),
      ),
    );
  }
}
