import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import {
  AccountingAccountClass,
  AccountingTxType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { DEFAULT_ACCOUNTING_ACCOUNTS } from './accounting-chart-of-accounts';

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

@Injectable()
export class AccountingChartService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async initializeDefaults() {
    for (
      let rootIndex = 0;
      rootIndex < DEFAULT_CATEGORY_TREE.length;
      rootIndex += 1
    ) {
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

      for (
        let childIndex = 0;
        childIndex < root.children.length;
        childIndex += 1
      ) {
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

    for (const account of DEFAULT_ACCOUNTING_ACCOUNTS) {
      await this.prisma.accountingAccount.upsert({
        where: { accountStableId: account.accountStableId },
        create: account,
        update: { accountClass: account.accountClass },
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
      throw new BadRequestException(
        'parent category type must match category type',
      );
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
          throw new BadRequestException(
            'parent category type must match category type',
          );
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
        throw new ConflictException(
          'category name already exists for this type',
        );
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
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return this.getCategory(categoryStableId);
  }

  async listAccounts() {
    return this.prisma.accountingAccount.findMany({
      where: {
        isActive: true,
        accountClass: AccountingAccountClass.ASSET,
        type: { not: null },
      },
      select: {
        accountStableId: true,
        name: true,
        type: true,
        accountClass: true,
        currency: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async readAccountingAccountFacts() {
    return this.prisma.accountingAccount.findMany({
      select: {
        accountStableId: true,
        accountClass: true,
        currency: true,
        isActive: true,
      },
      orderBy: { accountStableId: 'asc' },
    });
  }

  async createAccount(input: {
    name: string;
    type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
    currency?: string;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name is required');
    return this.prisma.accountingAccount.create({
      data: {
        accountStableId: `account_${createId()}`,
        name,
        type: input.type,
        accountClass: AccountingAccountClass.ASSET,
        currency: input.currency?.trim().toUpperCase() || 'CAD',
      },
      select: {
        accountStableId: true,
        name: true,
        type: true,
        accountClass: true,
        currency: true,
      },
    });
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
    const rows = await this.prisma.accountingCategory.findMany({
      select: {
        id: true,
        categoryStableId: true,
        parentId: true,
      },
    });
    const stableIdByDbId = new Map(
      rows.map((row) => [row.id, row.categoryStableId]),
    );
    const parentByStableId = new Map<string, string | null>(
      rows.map((row) => [
        row.categoryStableId,
        row.parentId ? (stableIdByDbId.get(row.parentId) ?? null) : null,
      ]),
    );

    let cursor: string | null = candidateDescendantStableId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === categoryStableId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = parentByStableId.get(cursor) ?? null;
    }
    return false;
  }
}
