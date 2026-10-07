import {
  AccountingArtifactKind,
  AccountingInboxMaterializedEntityType,
  Prisma,
} from '@prisma/client';
import {
  AccountingJournalSource,
  type AccountingDocumentStatus,
} from './accounting-contracts';
import type { AccountingDb } from './accounting-db';
import type { AccountingExpensePaymentState } from './accounting-expense.contracts';
import {
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
} from './accounting-expense-journal.policy';
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
  const fundingWhere: Prisma.AccountingExpenseDocumentWhereInput | undefined =
    params.paymentAccountStableId
      ? {
          OR: [
            {
              AND: [
                {
                  OR: [
                    { fundingAttributionVersion: 1 },
                    { fundingAttributionVersion: null },
                  ],
                },
                {
                  paymentAllocations: {
                    some: {
                      account: {
                        accountStableId: params.paymentAccountStableId,
                      },
                    },
                  },
                },
              ],
            },
            {
              AND: [
                { fundingAttributionVersion: 2 },
                {
                  splits: {
                    some: {
                      paidFromAccount: {
                        accountStableId: params.paymentAccountStableId,
                      },
                    },
                  },
                },
              ],
            },
          ],
        }
      : params.paymentState === 'UNASSIGNED'
        ? {
            OR: [
              {
                AND: [
                  {
                    OR: [
                      { fundingAttributionVersion: 1 },
                      { fundingAttributionVersion: null },
                    ],
                  },
                  { paymentAllocations: { none: {} } },
                ],
              },
              {
                AND: [
                  { fundingAttributionVersion: 2 },
                  { splits: { some: { paidFromAccountId: null } } },
                ],
              },
            ],
          }
        : params.paymentState === 'ASSIGNED'
          ? {
              OR: [
                {
                  AND: [
                    {
                      OR: [
                        { fundingAttributionVersion: 1 },
                        { fundingAttributionVersion: null },
                      ],
                    },
                    { paymentAllocations: { some: {} } },
                  ],
                },
                {
                  AND: [
                    { fundingAttributionVersion: 2 },
                    { splits: { some: {} } },
                    {
                      splits: {
                        every: { paidFromAccountId: { not: null } },
                      },
                    },
                  ],
                },
              ],
            }
          : undefined;
  const where = {
    status: params.status,
    ...(params.documentStableId
      ? { documentStableId: params.documentStableId }
      : {}),
    ...(occurredAt ? { occurredAt } : {}),
    ...(params.minTotalCents !== undefined
      ? { totalCents: { gte: params.minTotalCents } }
      : {}),
    ...(fundingWhere ?? {}),
  } satisfies Prisma.AccountingExpenseDocumentWhereInput;

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

export async function readAccountingExpenseDocument(
  db: AccountingDb,
  documentStableId: string,
) {
  const row = await db.accountingExpenseDocument.findUnique({
    where: { documentStableId },
    select: ACCOUNTING_DOCUMENT_SELECT,
  });
  if (!row) return null;
  const [sourceEvidence, postedStates] = await Promise.all([
    readExpenseSourceEvidence(db, [documentStableId]),
    readExpensePostedStates(db, [row]),
  ]);
  return presentAccountingExpenseDocument(
    row,
    sourceEvidence.get(documentStableId) ?? null,
    postedStates.get(documentStableId) ?? EMPTY_POSTED_STATE,
  );
}

async function presentAccountingExpenseRows(
  db: AccountingDb,
  rows: AccountingDocumentRow[],
) {
  const [sourceEvidence, postedStates] = await Promise.all([
    readExpenseSourceEvidence(
      db,
      rows.map((row) => row.documentStableId),
    ),
    readExpensePostedStates(db, rows),
  ]);
  return rows.map((row) =>
    presentAccountingExpenseDocument(
      row,
      sourceEvidence.get(row.documentStableId) ?? null,
      postedStates.get(row.documentStableId) ?? EMPTY_POSTED_STATE,
    ),
  );
}

type AccountingExpensePostedState = {
  canonicalPosted: boolean;
  activeCorrectionStatus: 'DRAFT' | 'READY' | null;
  hasPostedCorrections: boolean;
  correctionCount: number;
};

const EMPTY_POSTED_STATE: AccountingExpensePostedState = {
  canonicalPosted: false,
  activeCorrectionStatus: null,
  hasPostedCorrections: false,
  correctionCount: 0,
};

async function readExpensePostedStates(
  db: AccountingDb,
  rows: AccountingDocumentRow[],
): Promise<Map<string, AccountingExpensePostedState>> {
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

  const [journals, corrections] = await Promise.all([
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
    db.accountingCorrectionCase.findMany({
      where: {
        targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
        targetStableId: { in: documentStableIds },
      },
      select: {
        targetStableId: true,
        targetVersion: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { correctionStableId: 'asc' }],
    }),
  ]);

  const states = new Map(
    documentStableIds.map(
      (documentStableId) =>
        [
          documentStableId,
          { ...EMPTY_POSTED_STATE },
        ] as const,
    ),
  );

  const matchedJournalCounts = new Map<string, number>();
  for (const journal of journals) {
    const identity = identities.get(journal.sourceFactStableId);
    if (
      identity &&
      journal.sourceFactType === identity.sourceFactType &&
      journal.sourceFactVersion === identity.targetVersion
    ) {
      matchedJournalCounts.set(
        journal.sourceFactStableId,
        (matchedJournalCounts.get(journal.sourceFactStableId) ?? 0) + 1,
      );
    }
  }
  for (const row of rows) {
    const state = states.get(row.documentStableId);
    if (!state) continue;
    if (row.status !== AccountingDocumentStatus.CONFIRMED) {
      state.canonicalPosted = false;
      continue;
    }
    const journalCount = matchedJournalCounts.get(row.documentStableId) ?? 0;
    if ((row.fundingAttributionVersion ?? 1) === 1) {
      state.canonicalPosted = journalCount === 1;
      continue;
    }
    const fundingStableIds = row.splits.map(
      (split) => split.paidFromAccount?.accountStableId ?? null,
    );
    const expectedFundingGroups = new Set(
      fundingStableIds.filter((value): value is string => Boolean(value)),
    ).size;
    state.canonicalPosted =
      fundingStableIds.length > 0 &&
      fundingStableIds.every(Boolean) &&
      journalCount === expectedFundingGroups;
  }

  for (const correction of corrections) {
    const identity = identities.get(correction.targetStableId);
    const state = states.get(correction.targetStableId);
    if (
      !identity ||
      !state ||
      correction.targetVersion !== identity.targetVersion
    ) {
      continue;
    }
    state.correctionCount += 1;
    if (correction.status === AccountingPostedCorrectionStatus.POSTED) {
      state.hasPostedCorrections = true;
    }
    if (
      correction.status === AccountingPostedCorrectionStatus.DRAFT ||
      correction.status === AccountingPostedCorrectionStatus.READY
    ) {
      state.activeCorrectionStatus = correction.status;
    }
  }

  return states;
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
  correctionState: AccountingExpensePostedState,
) {
  return {
    documentStableId: row.documentStableId,
    source: row.source,
    status: row.status,
    fundingAttributionVersion: row.fundingAttributionVersion ?? 1,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    currency: row.currency,
    emailSubject: row.emailSubject,
    attachmentUrls: row.attachmentUrls,
    sourceEvidence,
    extractedText: row.extractedText?.slice(0, 20_000) ?? null,
    extraction: row.extractionJson,
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    correctionState,
    paymentAllocations: row.paymentAllocations.map((allocation) => ({
      paymentAllocationStableId: allocation.paymentAllocationStableId,
      accountStableId: allocation.account.accountStableId,
      accountName: allocation.account.name,
      amountCents: allocation.amountCents,
      sortOrder: allocation.sortOrder,
    })),
    splits: row.splits.map((split) => ({
      splitStableId: split.splitStableId,
      categoryStableId: split.category.categoryStableId,
      categoryName: split.category.name,
      amountCents: split.amountCents,
      taxCents: split.taxCents,
      paidFromAccountStableId: split.paidFromAccount?.accountStableId ?? null,
      paidFromAccountName: split.paidFromAccount?.name ?? null,
      sortOrder: split.sortOrder,
    })),
  };
}
