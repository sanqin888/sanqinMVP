import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AccountingAccountClass,
  AccountingArtifactKind,
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingFinancialProvider,
  AccountingJournalSource,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingSourceType,
  AccountingTxType,
} from './accounting-contracts';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { DEFAULT_ACCOUNTING_ACCOUNTS } from './accounting-chart-of-accounts';
import {
  confirmAccountingOtherInboxItem,
  confirmAccountingProviderFinancialInboxItem,
  discardAccountingInboxItem,
  ensureAccountingProviderFinancialCoverage,
  recordAccountingInboxParseRun,
  recordAccountingProviderFinancialDocument,
  registerAccountingInboxArtifact,
  setAccountingInboxClassification,
  suggestAccountingInboxClassification,
  upsertAccountingTrustedSender,
} from './accounting-inbox-core.orchestrator';
import {
  AccountingInboxPolicyError,
  type AccountingInboxArtifactInput,
  type AccountingInboxClassificationSelectionInput,
  type AccountingParseRunInput,
  type AccountingProviderFinancialDocumentInput,
  type AccountingTrustedSenderInput,
} from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';
import {
  linkAndConfirmInboxExpenseInTx,
  markInboxExpenseConfirmedInTx,
} from './accounting-inbox-expense.writer';
import {
  beginAccountingImageOriginalPurgeInTx,
  discardAccountingImageRetentionCandidateInTx,
  finalizeAccountingImageOriginalPurgeInTx,
  stageAccountingImageRetentionCandidateInTx,
  type AccountingImageRetentionCandidateInput,
} from './accounting-image-retention.writer';
import {
  accountingJsonRecord,
  accountingOptionalString,
  countAccountingInboxReviewItems,
  getAccountingSenderTrustDecision,
  listAccountingImageRetentionQueue,
  listAccountingManualUploadLibrary,
  listAccountingTrustedSenders,
  listAccountingUnifiedInboxItems,
  readAccountingImageArtifactContentContext,
  readAccountingImageRetentionContext,
  readAccountingInboxExpenseContext,
  readAccountingInboxProviderReviewContext,
} from './accounting-inbox-query';
import { AccountingPeriodService } from './accounting-period.service';
import { permanentlyDeleteManualUploadInTx } from './accounting-upload-library.writer';
import { updateAccountingProviderRecognitionRule } from './accounting-provider-recognition.orchestrator';
import {
  AccountingProviderRecognitionPolicyError,
  type AccountingProviderRecognitionRuleUpdate,
} from './accounting-provider-recognition.policy';
import { listAccountingProviderRecognitionRules } from './accounting-provider-recognition.query';

export type AccountingExpenseSplitInput = {
  categoryStableId: string;
  amountCents: number;
  taxCents?: number;
};

export type AccountingExpensePaymentAllocationInput = {
  accountStableId: string;
  amountCents: number;
};

export type AccountingExpenseInput = {
  occurredAt: string;
  totalCents: number;
  sourceCurrency?: string | null;
  paymentAllocations?: AccountingExpensePaymentAllocationInput[];
  attachmentUrls?: string[];
  memo?: string | null;
  splits: AccountingExpenseSplitInput[];
};

type NormalizedExpensePaymentAllocation =
  AccountingExpensePaymentAllocationInput & {
    sortOrder: number;
  };

type ResolvedExpensePaymentAllocation = NormalizedExpensePaymentAllocation & {
  accountDbId: string;
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
  extractedText: true,
  extractionJson: true,
  memo: true,
  createdAt: true,
  confirmedAt: true,
  paymentAllocations: {
    select: {
      paymentAllocationStableId: true,
      amountCents: true,
      sortOrder: true,
      account: {
        select: {
          accountStableId: true,
          name: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
    private readonly period: AccountingPeriodService,
  ) {}

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

  async readProviderSettlementDocuments(params: {
    storeStableId: string;
    provider?: AccountingFinancialProvider;
  }) {
    return this.prisma.accountingProviderFinancialDocument.findMany({
      where: {
        storeStableId: params.storeStableId,
        ...(params.provider ? { provider: params.provider } : {}),
      },
      select: {
        documentStableId: true,
        provider: true,
        documentType: true,
        businessIdentityKey: true,
        revision: true,
        supersedesDocumentId: true,
        storeStableId: true,
        providerDocumentRef: true,
        periodStart: true,
        periodEnd: true,
        settledAt: true,
        payoutAt: true,
        currency: true,
        rawMetadata: true,
        artifact: {
          select: {
            inboxItem: {
              select: {
                inboxItemStableId: true,
                status: true,
                materializedEntityType: true,
                materializedEntityStableId: true,
                reviewedAt: true,
                reviewedByUserStableId: true,
                version: true,
              },
            },
          },
        },
        lines: {
          select: {
            lineStableId: true,
            lineNo: true,
            rawCode: true,
            rawName: true,
            component: true,
            postingTreatment: true,
            taxRole: true,
            amountCents: true,
            occurredAt: true,
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [
        { provider: 'asc' },
        { businessIdentityKey: 'asc' },
        { revision: 'desc' },
      ],
    });
  }

  async readProviderFinancialCoverage(params: {
    storeStableId: string;
    providers: AccountingFinancialProvider[];
  }) {
    if (params.providers.length === 0) return [];
    return this.prisma.accountingProviderFinancialCoverage.findMany({
      where: {
        storeStableId: params.storeStableId,
        provider: { in: params.providers },
      },
      select: {
        coverageStableId: true,
        provider: true,
        storeStableId: true,
        financialHistoryRequiredFrom: true,
        financialCompleteThrough: true,
        liveOrderFactCutoverAt: true,
        orderDetailCoverageFrom: true,
        updatedAt: true,
      },
      orderBy: { provider: 'asc' },
    });
  }

  async readOrderSaleJournalsByFactStableIds(factStableIds: string[]) {
    if (factStableIds.length === 0) return [];
    return this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        source: AccountingJournalSource.ORDER,
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: { in: factStableIds },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        idempotencyHash: true,
        version: true,
        sourceFactStableId: true,
        storeStableId: true,
        occurredAt: true,
        currency: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            memo: true,
            account: { select: { accountStableId: true } },
            category: { select: { categoryStableId: true } },
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { entryStableId: 'asc' }],
    });
  }

  async readSettlementShadowExistingJournals(params: {
    providerDocumentStableIds: string[];
    uberOrderEntryStableIds: string[];
  }) {
    const filters: Prisma.AccountingJournalEntryWhereInput[] = [];
    if (params.providerDocumentStableIds.length > 0) {
      filters.push({
        sourceFactType: 'accounting.provider_financial_document.v1',
        sourceFactStableId: { in: params.providerDocumentStableIds },
      });
    }
    if (params.uberOrderEntryStableIds.length > 0) {
      filters.push({
        sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
        sourceFactStableId: { in: params.uberOrderEntryStableIds },
      });
    }
    if (filters.length === 0) return [];
    return this.prisma.accountingJournalEntry.findMany({
      where: { deletedAt: null, OR: filters },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
      },
      orderBy: { entryStableId: 'asc' },
    });
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
    const created = await this.prisma.accountingAccount.create({
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
    return created;
  }

  async registerInboxArtifact(input: AccountingInboxArtifactInput) {
    return this.runInboxCore(() =>
      registerAccountingInboxArtifact(this.prisma, input),
    );
  }

  senderTrustDecision(email: string) {
    return getAccountingSenderTrustDecision(this.prisma, email);
  }

  listTrustedSenders() {
    return listAccountingTrustedSenders(this.prisma);
  }

  listProviderRecognitionRules() {
    return listAccountingProviderRecognitionRules(this.prisma);
  }

  async updateProviderRecognitionRule(
    ruleStableId: string,
    input: AccountingProviderRecognitionRuleUpdate,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      updateAccountingProviderRecognitionRule(
        this.prisma,
        ruleStableId,
        input,
        operatorUserStableId,
      ),
    );
  }

  listUnifiedInboxItems(params: {
    status?: AccountingInboxStatus;
    classification?: AccountingInboxClassification;
    limit?: number;
  }) {
    return listAccountingUnifiedInboxItems(this.prisma, params);
  }

  listManualUploadLibrary(limit?: number) {
    return listAccountingManualUploadLibrary(this.prisma, limit);
  }

  async permanentlyDeleteManualUpload(inboxItemStableId: string) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        permanentlyDeleteManualUploadInTx(tx, inboxItemStableId),
      ),
    );
  }

  listImageRetentionQueue(limit?: number) {
    return listAccountingImageRetentionQueue(this.prisma, limit);
  }

  readUnifiedInboxProviderReviewContext(inboxItemStableId: string) {
    return readAccountingInboxProviderReviewContext(
      this.prisma,
      inboxItemStableId,
    );
  }

  readImageRetentionContext(inboxItemStableId: string) {
    return readAccountingImageRetentionContext(this.prisma, inboxItemStableId);
  }

  readImageArtifactContentContext(artifactStableId: string) {
    return readAccountingImageArtifactContentContext(
      this.prisma,
      artifactStableId,
    );
  }

  async stageImageRetentionCandidate(
    input: AccountingImageRetentionCandidateInput,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        stageAccountingImageRetentionCandidateInTx(tx, input),
      ),
    );
  }

  async discardImageRetentionCandidate(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        discardAccountingImageRetentionCandidateInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async beginImageOriginalPurge(
    inboxItemStableId: string,
    operatorUserStableId: string,
    compressionPolicyVersion: number,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        beginAccountingImageOriginalPurgeInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
          compressionPolicyVersion,
        ),
      ),
    );
  }

  async finalizeImageOriginalPurge(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        finalizeAccountingImageOriginalPurgeInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async suggestUnifiedInboxClassification(
    artifactStableId: string,
    input: AccountingInboxClassificationSelectionInput,
  ) {
    return this.runInboxCore(() =>
      suggestAccountingInboxClassification(
        this.prisma,
        artifactStableId,
        input,
      ),
    );
  }

  async setUnifiedInboxClassification(
    inboxItemStableId: string,
    input: AccountingInboxClassificationSelectionInput,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      setAccountingInboxClassification(
        this.prisma,
        inboxItemStableId,
        input,
        operatorUserStableId,
      ),
    );
  }

  async confirmUnifiedInboxOther(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      confirmAccountingOtherInboxItem(
        this.prisma,
        inboxItemStableId,
        operatorUserStableId,
      ),
    );
  }

  async confirmUnifiedInboxExpense(
    inboxItemStableId: string,
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    this.assertNoLegacyExpensePaymentAccount(input);
    const occurredAt = this.parseDate(input.occurredAt);
    this.assertMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
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
        'expense splits do not match CAD booking total',
      );
    }
    const requestedSourceCurrency =
      input.sourceCurrency?.trim().toUpperCase() || null;
    if (
      requestedSourceCurrency &&
      !/^[A-Z]{3}$/.test(requestedSourceCurrency)
    ) {
      throw new BadRequestException('sourceCurrency must be a 3-letter code');
    }

    const documentStableId = `expense_${createId()}`;
    await runSerializableAccountingWrite(this.prisma, async (tx) => {
      const inbox = await readAccountingInboxExpenseContext(
        tx,
        inboxItemStableId,
      );
      if (!inbox)
        throw new NotFoundException('accounting inbox item not found');
      if (inbox.status !== AccountingInboxStatus.PENDING_REVIEW) {
        throw new ConflictException(
          'only pending inbox items can be confirmed',
        );
      }
      if (
        inbox.classification !==
          AccountingInboxClassification.EXPENSE_DOCUMENT ||
        inbox.selectedProvider
      ) {
        throw new ConflictException(
          'inbox item must be classified as an expense before confirmation',
        );
      }
      if (inbox.materializedEntityType || inbox.materializedEntityStableId) {
        throw new ConflictException(
          'pending inbox expenses must not already be materialized',
        );
      }
      if (inbox.artifact.acquisitionMode === 'PROVIDER_API') {
        throw new ConflictException(
          'provider API evidence cannot be confirmed as an expense',
        );
      }
      const extraction = accountingJsonRecord(
        inbox.artifact.parseRuns[0]?.resultJson,
      );
      if (extraction.requiresBatchExpenseImport === true) {
        throw new ConflictException(
          'structured expense CSV batch cannot be confirmed as a single expense',
        );
      }

      await this.period.assertOnOrAfterAccountingStartDate(occurredAt, tx);
      await this.period.assertEditableForPeriod(
        occurredAt,
        AccountingTxType.EXPENSE,
        tx,
      );

      const categories = await tx.accountingCategory.findMany({
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
      if (
        normalizedSplits.some(
          (split) => !categoryMap.has(split.categoryStableId),
        )
      ) {
        throw new BadRequestException(
          'one or more expense categories are invalid',
        );
      }

      const resolvedPaymentAllocations =
        await this.resolveExpensePaymentAllocations(
          tx,
          normalizedPaymentAllocations,
        );

      const metadata = accountingJsonRecord(inbox.artifact.metadataJson);
      const extractedSourceCurrency = accountingOptionalString(
        extraction.sourceCurrency,
      )?.toUpperCase();
      const reviewedSourceCurrency =
        requestedSourceCurrency ?? extractedSourceCurrency ?? null;
      if (
        reviewedSourceCurrency &&
        !/^[A-Z]{3}$/.test(reviewedSourceCurrency)
      ) {
        throw new BadRequestException('sourceCurrency must be a 3-letter code');
      }
      const artifactUrl = inbox.artifact.storedUrl
        ? inbox.artifact.kind === AccountingArtifactKind.IMAGE
          ? `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(inbox.artifact.artifactStableId)}/content`
          : inbox.artifact.storedUrl
        : null;
      const attachmentUrls = Array.from(
        new Set(
          [artifactUrl, ...this.normalizeUrls(input.attachmentUrls)].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );
      const extractionJson = {
        ...extraction,
        reviewedSourceCurrency,
        bookedCurrency: 'CAD',
        bookedSubtotalCents: subtotalCents,
        bookedTaxCents: taxCents,
        bookedTotalCents: input.totalCents,
      } satisfies Record<string, unknown>;

      const created = await tx.accountingExpenseDocument.create({
        data: {
          documentStableId,
          source:
            inbox.artifact.acquisitionMode === 'EMAIL'
              ? AccountingDocumentSource.GMAIL
              : AccountingDocumentSource.MANUAL,
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          currency: 'CAD',
          gmailMessageId: accountingOptionalString(metadata.gmailMessageId),
          gmailAttachmentId: accountingOptionalString(
            metadata.gmailAttachmentId,
          ),
          fileHash: inbox.artifact.contentHash,
          emailSubject: inbox.artifact.emailSubject,
          attachmentUrls,
          extractedText:
            accountingOptionalString(extraction.extractedText) ??
            inbox.artifact.bodyText,
          extractionJson: extractionJson as Prisma.InputJsonValue,
          memo: input.memo?.trim() || null,
          confirmedAt: new Date(),
          confirmedByUserStableId: operatorUserStableId,
        },
        select: { id: true },
      });
      await this.createExpensePaymentAllocationsInTx(
        tx,
        created.id,
        resolvedPaymentAllocations,
      );

      const splitRows = normalizedSplits.map((split, index) => ({
        txStableId: `accttx_${createId()}`,
        type: AccountingTxType.EXPENSE,
        source: AccountingSourceType.MANUAL,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
        currency: 'CAD',
        occurredAt,
        categoryId: categoryMap.get(split.categoryStableId)!,
        documentId: created.id,
        idempotencyKey: `expense:${documentStableId}:${index}`,
        externalRef: documentStableId,
        memo: input.memo?.trim() || null,
        attachmentUrls,
        createdByUserStableId: operatorUserStableId,
        updatedByUserStableId: operatorUserStableId,
      }));
      await tx.accountingTransaction.createMany({ data: splitRows });
      await tx.accountingAuditLog.createMany({
        data: splitRows.map((row, index) => ({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          entityId: row.txStableId,
          operatorActorRef: operatorUserStableId,
          afterJson: {
            txStableId: row.txStableId,
            type: row.type,
            source: row.source,
            amountCents: row.amountCents,
            taxCents: row.taxCents,
            currency: row.currency,
            occurredAt: occurredAt.toISOString(),
            categoryStableId: normalizedSplits[index].categoryStableId,
            documentStableId,
            idempotencyKey: row.idempotencyKey,
            externalRef: row.externalRef,
            attachmentUrls,
          } as Prisma.InputJsonValue,
        })),
      });
      await linkAndConfirmInboxExpenseInTx(
        tx,
        inboxItemStableId,
        documentStableId,
        operatorUserStableId,
      );
    });

    return this.getExpenseDocument(documentStableId);
  }

  async discardUnifiedInboxItem(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      discardAccountingInboxItem(
        this.prisma,
        inboxItemStableId,
        operatorUserStableId,
      ),
    );
  }

  async recordInboxParseRun(input: AccountingParseRunInput) {
    return this.runInboxCore(() =>
      recordAccountingInboxParseRun(this.prisma, input),
    );
  }

  async upsertTrustedSender(
    input: AccountingTrustedSenderInput,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      upsertAccountingTrustedSender(this.prisma, input, operatorUserStableId),
    );
  }

  async recordProviderFinancialDocument(
    input: AccountingProviderFinancialDocumentInput,
  ) {
    return this.runInboxCore(() =>
      recordAccountingProviderFinancialDocument(this.prisma, input),
    );
  }

  async confirmProviderFinancialInboxItem(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      confirmAccountingProviderFinancialInboxItem(
        this.prisma,
        inboxItemStableId,
        operatorUserStableId,
      ),
    );
  }

  async ensureProviderFinancialCoverage(
    provider: AccountingFinancialProvider,
    storeStableId: string,
    operatorUserStableId?: string,
  ) {
    return this.runInboxCore(() =>
      ensureAccountingProviderFinancialCoverage(
        this.prisma,
        provider,
        storeStableId,
        operatorUserStableId,
      ),
    );
  }

  async createExpense(
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    this.assertNoLegacyExpensePaymentAccount(input);
    const occurredAt = this.parseDate(input.occurredAt);
    this.assertMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
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

    const attachmentUrls = this.normalizeUrls(input.attachmentUrls);
    const documentStableId = `expense_${createId()}`;
    const document = await runSerializableAccountingWrite(
      this.prisma,
      async (tx) => {
        await this.period.assertOnOrAfterAccountingStartDate(
          occurredAt,
          tx,
        );
        await this.period.assertEditableForPeriod(
          occurredAt,
          AccountingTxType.EXPENSE,
          tx,
        );
        const resolvedPaymentAllocations =
          await this.resolveExpensePaymentAllocations(
            tx,
            normalizedPaymentAllocations,
          );

        const created = await tx.accountingExpenseDocument.create({
          data: {
            documentStableId,
            source: AccountingDocumentSource.MANUAL,
            status: AccountingDocumentStatus.CONFIRMED,
            occurredAt,
            subtotalCents,
            taxCents,
            totalCents: input.totalCents,
            currency: 'CAD',
            attachmentUrls,
            memo: input.memo?.trim() || null,
            confirmedAt: new Date(),
            confirmedByUserStableId: operatorUserStableId,
          },
        });
        await this.createExpensePaymentAllocationsInTx(
          tx,
          created.id,
          resolvedPaymentAllocations,
        );

        const splitRows = normalizedSplits.map((split, index) => ({
          txStableId: `accttx_${createId()}`,
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          currency: 'CAD',
          occurredAt,
          categoryId: categoryMap.get(split.categoryStableId)!.id,
          documentId: created.id,
          idempotencyKey: `expense:${documentStableId}:${index}`,
          externalRef: documentStableId,
          memo: input.memo?.trim() || null,
          attachmentUrls,
          createdByUserStableId: operatorUserStableId,
          updatedByUserStableId: operatorUserStableId,
        }));
        await tx.accountingTransaction.createMany({ data: splitRows });
        await tx.accountingAuditLog.createMany({
          data: splitRows.map((row, index) => ({
            action: 'CREATE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: occurredAt.toISOString(),
              categoryStableId: normalizedSplits[index].categoryStableId,
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
        });
        return created;
      },
    );

    return this.getExpenseDocument(document.documentStableId);
  }

  async listExpenseDocuments(params: {
    status?: AccountingDocumentStatus;
    limit?: number;
  }) {
    const take = Math.min(Math.max(params.limit ?? 100, 1), 200);
    const startAt = await this.period.clampAccountingFromDate(undefined);
    const rows = await this.prisma.accountingExpenseDocument.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(startAt
          ? { OR: [{ occurredAt: null }, { occurredAt: { gte: startAt } }] }
          : {}),
      },
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
    this.assertNoLegacyExpensePaymentAccount(input);
    const existing = await this.prisma.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: { id: true, status: true, attachmentUrls: true },
    });
    if (!existing) throw new NotFoundException('expense document not found');
    if (existing.status === AccountingDocumentStatus.CONFIRMED) {
      throw new ConflictException('expense document is already confirmed');
    }

    const occurredAt = this.parseDate(input.occurredAt);
    this.assertMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
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
        'expense splits do not match document total',
      );
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
    if (
      normalizedSplits.some((split) => !categoryMap.has(split.categoryStableId))
    ) {
      throw new BadRequestException(
        'one or more expense categories are invalid',
      );
    }

    const newAttachmentUrls = this.normalizeUrls(input.attachmentUrls);

    await runSerializableAccountingWrite(this.prisma, async (tx) => {
      await this.period.assertOnOrAfterAccountingStartDate(occurredAt, tx);
      await this.period.assertEditableForPeriod(
        occurredAt,
        AccountingTxType.EXPENSE,
        tx,
      );
      const resolvedPaymentAllocations =
        await this.resolveExpensePaymentAllocations(
          tx,
          normalizedPaymentAllocations,
        );

      const current = await tx.accountingExpenseDocument.findUnique({
        where: { id: existing.id },
        select: { status: true, attachmentUrls: true },
      });
      if (!current) throw new NotFoundException('expense document not found');
      if (current.status === AccountingDocumentStatus.CONFIRMED) {
        throw new ConflictException('expense document is already confirmed');
      }

      const attachmentUrls = Array.from(
        new Set([...current.attachmentUrls, ...newAttachmentUrls]),
      );
      const replacedRows = await tx.accountingTransaction.findMany({
        where: { documentId: existing.id, deletedAt: null },
        select: {
          txStableId: true,
          type: true,
          source: true,
          amountCents: true,
          taxCents: true,
          currency: true,
          occurredAt: true,
          idempotencyKey: true,
          externalRef: true,
          attachmentUrls: true,
        },
      });
      await tx.accountingTransaction.deleteMany({
        where: { documentId: existing.id, deletedAt: null },
      });
      await tx.accountingExpensePaymentAllocation.deleteMany({
        where: { expenseDocumentId: existing.id },
      });
      await tx.accountingExpenseDocument.update({
        where: { id: existing.id },
        data: {
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          currency: 'CAD',
          attachmentUrls,
          memo: input.memo?.trim() || null,
          confirmedAt: new Date(),
          confirmedByUserStableId: operatorUserStableId,
        },
      });
      await this.createExpensePaymentAllocationsInTx(
        tx,
        existing.id,
        resolvedPaymentAllocations,
      );
      const splitRows = normalizedSplits.map((split, index) => ({
        txStableId: `accttx_${createId()}`,
        type: AccountingTxType.EXPENSE,
        source: AccountingSourceType.MANUAL,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
        currency: 'CAD',
        occurredAt,
        categoryId: categoryMap.get(split.categoryStableId)!,
        documentId: existing.id,
        idempotencyKey: `expense:${documentStableId}:${index}`,
        externalRef: documentStableId,
        memo: input.memo?.trim() || null,
        attachmentUrls,
        createdByUserStableId: operatorUserStableId,
        updatedByUserStableId: operatorUserStableId,
      }));
      await tx.accountingTransaction.createMany({ data: splitRows });
      await tx.accountingAuditLog.createMany({
        data: [
          ...replacedRows.map((row) => ({
            action: 'DELETE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            beforeJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: row.occurredAt.toISOString(),
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls: row.attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
          ...splitRows.map((row, index) => ({
            action: 'CREATE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: occurredAt.toISOString(),
              categoryStableId: normalizedSplits[index].categoryStableId,
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
        ],
      });
      const linkedInbox = await tx.accountingInboxItem.findFirst({
        where: {
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          materializedEntityStableId: documentStableId,
        },
        select: { inboxItemStableId: true },
      });
      if (linkedInbox) {
        await markInboxExpenseConfirmedInTx(
          tx,
          linkedInbox.inboxItemStableId,
          documentStableId,
          operatorUserStableId,
        );
      }
    });

    return this.getExpenseDocument(documentStableId);
  }

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
      extractedText: row.extractedText?.slice(0, 20_000) ?? null,
      extraction: row.extractionJson,
      memo: row.memo,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      paymentAllocations: row.paymentAllocations.map((allocation) => ({
        paymentAllocationStableId: allocation.paymentAllocationStableId,
        accountStableId: allocation.account.accountStableId,
        accountName: allocation.account.name,
        amountCents: allocation.amountCents,
        sortOrder: allocation.sortOrder,
      })),
      splits: row.transactions.map((tx) => ({
        txStableId: tx.txStableId,
        categoryStableId: tx.category.categoryStableId,
        categoryName: tx.category.name,
        amountCents: tx.amountCents,
        taxCents: tx.taxCents,
      })),
    };
  }

  private async runInboxCore<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof AccountingInboxPolicyError ||
        error instanceof AccountingProviderRecognitionPolicyError
      ) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof AccountingInboxWriterNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AccountingInboxWriterConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private assertNoLegacyExpensePaymentAccount(input: AccountingExpenseInput) {
    if (
      Object.prototype.hasOwnProperty.call(
        input as unknown as Record<string, unknown>,
        'accountStableId',
      )
    ) {
      throw new BadRequestException(
        'accountStableId is no longer supported for expenses; use paymentAllocations',
      );
    }
  }

  private normalizeExpensePaymentAllocations(
    input: AccountingExpensePaymentAllocationInput[] | undefined,
    totalCents: number,
  ): NormalizedExpensePaymentAllocation[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) {
      throw new BadRequestException('paymentAllocations must be an array');
    }

    const seenAccounts = new Set<string>();
    const normalized = input.map((allocation, sortOrder) => {
      if (!allocation || typeof allocation !== 'object') {
        throw new BadRequestException('payment allocation is invalid');
      }
      const accountStableId = allocation.accountStableId?.trim();
      if (!accountStableId) {
        throw new BadRequestException(
          'payment allocation accountStableId is required',
        );
      }
      if (seenAccounts.has(accountStableId)) {
        throw new BadRequestException(
          'paymentAllocations must not repeat an account',
        );
      }
      seenAccounts.add(accountStableId);
      if (
        !Number.isInteger(allocation.amountCents) ||
        allocation.amountCents <= 0
      ) {
        throw new BadRequestException(
          'payment allocation amountCents must be a positive integer',
        );
      }
      return {
        accountStableId,
        amountCents: allocation.amountCents,
        sortOrder,
      };
    });

    if (
      normalized.length > 0 &&
      normalized.reduce(
        (sum, allocation) => sum + allocation.amountCents,
        0,
      ) !== totalCents
    ) {
      throw new BadRequestException(
        'payment allocations do not match CAD booking total',
      );
    }
    return normalized;
  }

  private async resolveExpensePaymentAllocations(
    tx: Prisma.TransactionClient,
    allocations: NormalizedExpensePaymentAllocation[],
  ): Promise<ResolvedExpensePaymentAllocation[]> {
    if (!allocations.length) return [];
    const accounts = await tx.accountingAccount.findMany({
      where: {
        accountStableId: {
          in: allocations.map((allocation) => allocation.accountStableId),
        },
      },
      select: {
        id: true,
        accountStableId: true,
        currency: true,
        isActive: true,
      },
    });
    const accountByStableId = new Map(
      accounts.map((account) => [account.accountStableId, account]),
    );
    return allocations.map((allocation) => {
      const account = accountByStableId.get(allocation.accountStableId);
      if (!account || !account.isActive) {
        throw new BadRequestException(
          `payment account is invalid: ${allocation.accountStableId}`,
        );
      }
      if (account.currency !== 'CAD') {
        throw new BadRequestException(
          'expense payment accounts must use CAD functional currency',
        );
      }
      return {
        ...allocation,
        accountDbId: account.id,
      };
    });
  }

  private async createExpensePaymentAllocationsInTx(
    tx: Prisma.TransactionClient,
    expenseDocumentDbId: string,
    allocations: ResolvedExpensePaymentAllocation[],
  ) {
    if (!allocations.length) return;
    await tx.accountingExpensePaymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        paymentAllocationStableId: `expensepay_${createId()}`,
        expenseDocumentId: expenseDocumentDbId,
        accountId: allocation.accountDbId,
        amountCents: allocation.amountCents,
        sortOrder: allocation.sortOrder,
      })),
    });
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
