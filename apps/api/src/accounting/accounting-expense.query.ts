import { ConflictException } from '@nestjs/common';
import {
  AccountingArtifactKind,
  AccountingInboxMaterializedEntityType,
  Prisma,
} from '@prisma/client';
import {
  AccountingDocumentStatus,
  AccountingJournalSource,
} from './accounting-contracts';
import type { AccountingDb } from './accounting-db';
import type { AccountingExpensePaymentState } from './accounting-expense.contracts';
import {
  ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
  AccountingExpenseCorrectionTargetPolicyError,
  hashAccountingExpenseCorrectionTarget,
  normalizeAccountingExpenseCorrectionTarget,
  type AccountingExpenseCorrectionTargetV1,
} from './accounting-expense-correction-target.policy';
import {
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
} from './accounting-expense-journal.policy';
import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionProjections,
  type AccountingPostedCorrectionProjectionV1,
} from './accounting-posted-correction-read-model';
import {
  AccountingPostedCorrectionStatus,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';

const ACCOUNTING_DOCUMENT_SELECT = {
  documentStableId: true,
  source: true,
  status: true,
  fundingAttributionVersion: true,
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
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  splits: {
    select: {
      splitStableId: true,
      amountCents: true,
      taxCents: true,
      sortOrder: true,
      category: {
        select: { categoryStableId: true, name: true },
      },
      paidFromAccount: {
        select: {
          accountStableId: true,
          name: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.AccountingExpenseDocumentSelect;

type AccountingDocumentRow = Prisma.AccountingExpenseDocumentGetPayload<{
  select: typeof ACCOUNTING_DOCUMENT_SELECT;
}>;

export async function listAccountingExpenseDocuments(
  db: AccountingDb,
  params: {
    status?: AccountingDocumentStatus;
    limit?: number;
    startAt?: Date | null;
  },
) {
  const take = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const rows = await db.accountingExpenseDocument.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.startAt
        ? {
            OR: [{ occurredAt: null }, { occurredAt: { gte: params.startAt } }],
          }
        : {}),
    },
    select: ACCOUNTING_DOCUMENT_SELECT,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return presentAccountingExpenseRows(db, rows);
}

export async function listAccountingExpenseRecords(
  db: AccountingDb,
  params: {
    status: AccountingDocumentStatus;
    limit: number;
    offset: number;
    startAt?: Date;
    toExclusive?: Date;
    minTotalCents?: number;
    paymentAccountStableId?: string;
    paymentState?: AccountingExpensePaymentState;
    documentStableId?: string;
  },
) {
  const occurredAt =
    params.startAt || params.toExclusive
      ? {
          ...(params.startAt ? { gte: params.startAt } : {}),
          ...(params.toExclusive ? { lt: params.toExclusive } : {}),
        }
      : undefined;
  const where = {
    status: params.status,
    ...(params.documentStableId
      ? { documentStableId: params.documentStableId }
      : {}),
    ...(occurredAt ? { occurredAt } : {}),
  } satisfies Prisma.AccountingExpenseDocumentWhereInput;

  const requiresCurrentEffectiveFiltering =
    params.minTotalCents !== undefined ||
    Boolean(params.paymentAccountStableId) ||
    Boolean(params.paymentState);

  if (!requiresCurrentEffectiveFiltering) {
    const [rows, total] = await Promise.all([
      db.accountingExpenseDocument.findMany({
        where,
        select: ACCOUNTING_DOCUMENT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { documentStableId: 'desc' }],
        skip: params.offset,
        take: params.limit,
      }),
      db.accountingExpenseDocument.count({ where }),
    ]);
    return {
      items: await presentAccountingExpenseRows(db, rows),
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  const rows = await db.accountingExpenseDocument.findMany({
    where,
    select: ACCOUNTING_DOCUMENT_SELECT,
    orderBy: [{ createdAt: 'desc' }, { documentStableId: 'desc' }],
  });
  const presented = await presentAccountingExpenseRows(db, rows);
  const filtered = presented.filter((document) => {
    if (
      params.minTotalCents !== undefined &&
      (document.totalCents == null ||
        document.totalCents < params.minTotalCents)
    ) {
      return false;
    }

    if (params.paymentAccountStableId) {
      const matchesAccount =
        document.fundingAttributionVersion === 2
          ? document.splits.some(
              (split) =>
                split.paidFromAccountStableId === params.paymentAccountStableId,
            )
          : document.paymentAllocations.some(
              (allocation) =>
                allocation.accountStableId === params.paymentAccountStableId,
            );
      if (!matchesAccount) return false;
    }

    if (params.paymentState) {
      const assigned =
        document.fundingAttributionVersion === 2
          ? document.splits.length > 0 &&
            document.splits.every(
              (split) => split.paidFromAccountStableId !== null,
            )
          : document.paymentAllocations.length > 0;
      if (params.paymentState === 'ASSIGNED' && !assigned) return false;
      if (params.paymentState === 'UNASSIGNED' && assigned) return false;
    }
    return true;
  });

  return {
    items: filtered.slice(params.offset, params.offset + params.limit),
    total: filtered.length,
    limit: params.limit,
    offset: params.offset,
  };
}

export async function readAccountingExpenseDocument(
  db: AccountingDb,
  documentStableId: string,
) {
  const row = await db.accountingExpenseDocument.findUnique({
    where: { documentStableId },
    select: ACCOUNTING_DOCUMENT_SELECT,
  });
  if (!row) return null;
  const [sourceEvidence, postedReadModels] = await Promise.all([
    readExpenseSourceEvidence(db, [documentStableId]),
    readExpensePostedReadModels(db, [row]),
  ]);
  const dimensionNames = await readExpenseCurrentEffectiveDimensionNames(
    db,
    postedReadModels,
  );
  return presentAccountingExpenseDocument(
    row,
    sourceEvidence.get(documentStableId) ?? null,
    postedReadModels.get(documentStableId) ?? {
      correctionState: { ...EMPTY_POSTED_STATE },
      currentEffective: null,
    },
    dimensionNames,
  );
}

async function presentAccountingExpenseRows(
  db: AccountingDb,
  rows: AccountingDocumentRow[],
) {
  const [sourceEvidence, postedReadModels] = await Promise.all([
    readExpenseSourceEvidence(
      db,
      rows.map((row) => row.documentStableId),
    ),
    readExpensePostedReadModels(db, rows),
  ]);
  const dimensionNames = await readExpenseCurrentEffectiveDimensionNames(
    db,
    postedReadModels,
  );
  return rows.map((row) =>
    presentAccountingExpenseDocument(
      row,
      sourceEvidence.get(row.documentStableId) ?? null,
      postedReadModels.get(row.documentStableId) ?? {
        correctionState: { ...EMPTY_POSTED_STATE },
        currentEffective: null,
      },
      dimensionNames,
    ),
  );
}

type AccountingExpensePostedState = {
  canonicalPosted: boolean;
  activeCorrectionStatus: 'DRAFT' | 'READY' | null;
  hasPostedCorrections: boolean;
  correctionCount: number;
};

type AccountingExpenseCurrentEffectiveAuthority = {
  correctionStableId: string;
  targetAuthorityHash: string;
  postedAt: string;
  target: AccountingExpenseCorrectionTargetV1;
};

type AccountingExpensePostedReadModel = {
  correctionState: AccountingExpensePostedState;
  currentEffective: AccountingExpenseCurrentEffectiveAuthority | null;
};

const EMPTY_POSTED_STATE: AccountingExpensePostedState = {
  canonicalPosted: false,
  activeCorrectionStatus: null,
  hasPostedCorrections: false,
  correctionCount: 0,
};

const resolveExpenseCurrentEffectiveAuthority = (
  row: AccountingDocumentRow,
  projection: AccountingPostedCorrectionProjectionV1 | undefined,
): AccountingExpenseCurrentEffectiveAuthority | null => {
  const latest = projection?.latestPostedAuthority ?? null;
  if (!latest) return null;
  if (
    latest.targetAuthoritySchema !== ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA
  ) {
    throw new ConflictException(
      `latest POSTED Expense correction has unexpected authority schema: ${row.documentStableId}`,
    );
  }

  let target: AccountingExpenseCorrectionTargetV1;
  try {
    target = normalizeAccountingExpenseCorrectionTarget(
      latest.targetJson as unknown as AccountingExpenseCorrectionTargetV1,
    );
  } catch (error) {
    if (error instanceof AccountingExpenseCorrectionTargetPolicyError) {
      throw new ConflictException(
        `latest POSTED Expense correction target is invalid: ${row.documentStableId}: ${error.message}`,
      );
    }
    throw error;
  }
  if (
    hashAccountingExpenseCorrectionTarget(target) !== latest.targetAuthorityHash
  ) {
    throw new ConflictException(
      `latest POSTED Expense correction authority hash is inconsistent: ${row.documentStableId}`,
    );
  }

  const targetVersion = row.fundingAttributionVersion === 2 ? 2 : 1;
  if (
    target.document.documentStableId !== row.documentStableId ||
    target.document.fundingAttributionVersion !== targetVersion ||
    target.document.occurredAt !== row.occurredAt?.toISOString() ||
    target.document.currency !== row.currency
  ) {
    throw new ConflictException(
      `latest POSTED Expense correction immutable identity does not match source document: ${row.documentStableId}`,
    );
  }

  return {
    correctionStableId: latest.correctionStableId,
    targetAuthorityHash: latest.targetAuthorityHash,
    postedAt: latest.postedAt,
    target,
  };
};

async function readExpensePostedReadModels(
  db: AccountingDb,
  rows: AccountingDocumentRow[],
): Promise<Map<string, AccountingExpensePostedReadModel>> {
  if (!rows.length) return new Map();

  const identities = new Map(
    rows.map((row) => {
      const targetVersion = row.fundingAttributionVersion === 2 ? 2 : 1;
      return [
        row.documentStableId,
        {
          targetVersion,
          sourceFactType:
            targetVersion === 2
              ? CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2
              : CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
        },
      ] as const;
    }),
  );
  const documentStableIds = [...identities.keys()];
  const refs = rows.map((row) => ({
    targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
    targetStableId: row.documentStableId,
    targetVersion: row.fundingAttributionVersion === 2 ? 2 : 1,
  }));

  const [journals, projections] = await Promise.all([
    db.accountingJournalEntry.findMany({
      where: {
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactStableId: { in: documentStableIds },
        sourceFactType: {
          in: [
            CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
            CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
          ],
        },
        deletedAt: null,
      },
      select: {
        sourceFactStableId: true,
        sourceFactType: true,
        sourceFactVersion: true,
      },
    }),
    readAccountingPostedCorrectionProjections(db, refs),
  ]);

  const states = new Map<string, AccountingExpensePostedReadModel>(
    documentStableIds.map(
      (documentStableId): [string, AccountingExpensePostedReadModel] => [
        documentStableId,
        {
          correctionState: { ...EMPTY_POSTED_STATE },
          currentEffective: null,
        },
      ],
    ),
  );

  const matchedJournalCounts = new Map<string, number>();
  for (const journal of journals) {
    const sourceFactStableId = journal.sourceFactStableId;
    if (!sourceFactStableId) continue;
    const identity = identities.get(sourceFactStableId);
    if (
      identity &&
      journal.sourceFactType === identity.sourceFactType &&
      journal.sourceFactVersion === identity.targetVersion
    ) {
      matchedJournalCounts.set(
        sourceFactStableId,
        (matchedJournalCounts.get(sourceFactStableId) ?? 0) + 1,
      );
    }
  }

  for (const row of rows) {
    const readModel = states.get(row.documentStableId);
    const identity = identities.get(row.documentStableId);
    if (!readModel || !identity) continue;
    const journalCount = matchedJournalCounts.get(row.documentStableId) ?? 0;
    if (row.status === AccountingDocumentStatus.CONFIRMED) {
      if (identity.targetVersion === 1) {
        readModel.correctionState.canonicalPosted = journalCount === 1;
      } else {
        const fundingStableIds = row.splits.map(
          (split) => split.paidFromAccount?.accountStableId ?? null,
        );
        const expectedFundingGroups = new Set(
          fundingStableIds.filter((value): value is string => Boolean(value)),
        ).size;
        readModel.correctionState.canonicalPosted =
          fundingStableIds.length > 0 &&
          fundingStableIds.every(Boolean) &&
          journalCount === expectedFundingGroups;
      }
    }

    const ref = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: row.documentStableId,
      targetVersion: identity.targetVersion,
    } as const;
    const projection = projections.get(
      accountingPostedCorrectionTargetKey(ref),
    );
    for (const correction of projection?.cases ?? []) {
      readModel.correctionState.correctionCount += 1;
      if (correction.status === AccountingPostedCorrectionStatus.POSTED) {
        readModel.correctionState.hasPostedCorrections = true;
      }
      if (
        correction.status === AccountingPostedCorrectionStatus.DRAFT ||
        correction.status === AccountingPostedCorrectionStatus.READY
      ) {
        readModel.correctionState.activeCorrectionStatus = correction.status;
      }
    }
    readModel.currentEffective = resolveExpenseCurrentEffectiveAuthority(
      row,
      projection,
    );
  }

  return states;
}

type AccountingExpenseDimensionNames = {
  categoryNames: Map<string, string>;
  accountNames: Map<string, string>;
};

async function readExpenseCurrentEffectiveDimensionNames(
  db: AccountingDb,
  readModels: Map<string, AccountingExpensePostedReadModel>,
): Promise<AccountingExpenseDimensionNames> {
  const categoryStableIds = new Set<string>();
  const accountStableIds = new Set<string>();
  for (const readModel of readModels.values()) {
    const target = readModel.currentEffective?.target;
    if (!target) continue;
    for (const split of target.splits) {
      categoryStableIds.add(split.categoryStableId);
      if (split.paidFromAccountStableId) {
        accountStableIds.add(split.paidFromAccountStableId);
      }
    }
    for (const allocation of target.paymentAllocations) {
      accountStableIds.add(allocation.accountStableId);
    }
  }

  const [categories, accounts] = await Promise.all([
    categoryStableIds.size
      ? db.accountingCategory.findMany({
          where: { categoryStableId: { in: [...categoryStableIds] } },
          select: { categoryStableId: true, name: true },
        })
      : Promise.resolve([]),
    accountStableIds.size
      ? db.accountingAccount.findMany({
          where: { accountStableId: { in: [...accountStableIds] } },
          select: { accountStableId: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    categoryNames: new Map(
      categories.map(
        (category) => [category.categoryStableId, category.name] as const,
      ),
    ),
    accountNames: new Map(
      accounts.map(
        (account) => [account.accountStableId, account.name] as const,
      ),
    ),
  };
}

type AccountingExpenseSourceEvidence = {
  artifactStableId: string;
  kind: AccountingArtifactKind;
  originalFilename: string | null;
};

async function readExpenseSourceEvidence(
  db: AccountingDb,
  documentStableIds: string[],
): Promise<Map<string, AccountingExpenseSourceEvidence>> {
  if (!documentStableIds.length) return new Map();

  const inboxItems = await db.accountingInboxItem.findMany({
    where: {
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      materializedEntityStableId: { in: documentStableIds },
    },
    select: {
      materializedEntityStableId: true,
      artifact: {
        select: {
          artifactStableId: true,
          kind: true,
          originalFilename: true,
          storedUrl: true,
          binaryRetention: {
            select: {
              retainedStoredUrl: true,
            },
          },
        },
      },
    },
  });

  return new Map(
    inboxItems.flatMap((item) => {
      if (
        !item.materializedEntityStableId ||
        (!item.artifact.storedUrl &&
          !item.artifact.binaryRetention?.retainedStoredUrl)
      ) {
        return [];
      }
      return [
        [
          item.materializedEntityStableId,
          {
            artifactStableId: item.artifact.artifactStableId,
            kind: item.artifact.kind,
            originalFilename: item.artifact.originalFilename,
          },
        ] as const,
      ];
    }),
  );
}

function presentAccountingExpenseDocument(
  row: AccountingDocumentRow,
  sourceEvidence: AccountingExpenseSourceEvidence | null,
  readModel: AccountingExpensePostedReadModel,
  dimensionNames: AccountingExpenseDimensionNames,
) {
  const originalPaymentAllocations = row.paymentAllocations.map(
    (allocation) => ({
      paymentAllocationStableId: allocation.paymentAllocationStableId,
      accountStableId: allocation.account.accountStableId,
      accountName: allocation.account.name,
      amountCents: allocation.amountCents,
      sortOrder: allocation.sortOrder,
    }),
  );
  const originalSplits = row.splits.map((split) => ({
    splitStableId: split.splitStableId,
    categoryStableId: split.category.categoryStableId,
    categoryName: split.category.name,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
    paidFromAccountStableId: split.paidFromAccount?.accountStableId ?? null,
    paidFromAccountName: split.paidFromAccount?.name ?? null,
    sortOrder: split.sortOrder,
  }));

  const currentAuthority = readModel.currentEffective;
  const target = currentAuthority?.target ?? null;
  const effectivePaymentAllocations = target
    ? target.paymentAllocations.map((allocation, index) => {
        const accountName = dimensionNames.accountNames.get(
          allocation.accountStableId,
        );
        if (!accountName) {
          throw new ConflictException(
            `current-effective Expense payment account is missing: ${allocation.accountStableId}`,
          );
        }
        return {
          paymentAllocationStableId: allocation.paymentAllocationStableId,
          accountStableId: allocation.accountStableId,
          accountName,
          amountCents: allocation.amountCents,
          sortOrder: index,
        };
      })
    : originalPaymentAllocations;
  const effectiveSplits = target
    ? target.splits.map((split, index) => {
        const categoryName = dimensionNames.categoryNames.get(
          split.categoryStableId,
        );
        if (!categoryName) {
          throw new ConflictException(
            `current-effective Expense category is missing: ${split.categoryStableId}`,
          );
        }
        const paidFromAccountName = split.paidFromAccountStableId
          ? dimensionNames.accountNames.get(split.paidFromAccountStableId)
          : null;
        if (split.paidFromAccountStableId && !paidFromAccountName) {
          throw new ConflictException(
            `current-effective Expense funding account is missing: ${split.paidFromAccountStableId}`,
          );
        }
        return {
          splitStableId: split.splitStableId,
          categoryStableId: split.categoryStableId,
          categoryName,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          paidFromAccountStableId: split.paidFromAccountStableId,
          paidFromAccountName,
          sortOrder: index,
        };
      })
    : originalSplits;

  const subtotalCents = target?.document.subtotalCents ?? row.subtotalCents;
  const taxCents = target?.document.taxCents ?? row.taxCents;
  const totalCents = target?.document.totalCents ?? row.totalCents;
  const memo = target?.document.memo ?? row.memo;
  const originalPersisted = {
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    memo: row.memo,
    paymentAllocations: originalPaymentAllocations,
    splits: originalSplits,
  };
  const currentEffective = {
    source: target ? ('POSTED_CORRECTION' as const) : ('ORIGINAL' as const),
    correctionStableId: currentAuthority?.correctionStableId ?? null,
    targetAuthorityHash: currentAuthority?.targetAuthorityHash ?? null,
    postedAt: currentAuthority?.postedAt ?? null,
    subtotalCents,
    taxCents,
    totalCents,
    memo,
    paymentAllocations: effectivePaymentAllocations,
    splits: effectiveSplits,
  };

  return {
    documentStableId: row.documentStableId,
    source: row.source,
    status: row.status,
    fundingAttributionVersion: row.fundingAttributionVersion ?? 1,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    subtotalCents,
    taxCents,
    totalCents,
    currency: row.currency,
    emailSubject: row.emailSubject,
    attachmentUrls: row.attachmentUrls,
    sourceEvidence,
    extractedText: row.extractedText?.slice(0, 20_000) ?? null,
    extraction: row.extractionJson,
    memo,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    correctionState: readModel.correctionState,
    originalPersisted,
    currentEffective,
    paymentAllocations: effectivePaymentAllocations,
    splits: effectiveSplits,
  };
}
