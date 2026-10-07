import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { AccountingDb } from './accounting-db';
import {
  AccountingPostedCorrectionStatus,
  type AccountingPostedCorrectionPreviewPlanV1,
  type AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';

export type AccountingPostedCorrectionReadDb =
  | AccountingDb
  | Prisma.TransactionClient;

export type AccountingPostedCorrectionTargetRef = {
  targetKind: AccountingPostedCorrectionTargetKind;
  targetStableId: string;
  targetVersion: number;
};

export type AccountingPostedCorrectionCaseSummaryV1 = {
  correctionStableId: string;
  status: string;
  reasonCode: string;
  note: string | null;
  strategy: string | null;
  createdAt: string;
  postedAt: string | null;
  postedByActorRef: string | null;
};

export type AccountingPostedCorrectionLatestAuthorityV1 = {
  correctionStableId: string;
  targetAuthoritySchema: string;
  targetAuthorityHash: string;
  targetJson: Prisma.JsonValue;
  postedAt: string;
  postedByActorRef: string;
};

export type AccountingPostedCorrectionProjectionV1 = {
  version: 1;
  target: AccountingPostedCorrectionTargetRef;
  cases: AccountingPostedCorrectionCaseSummaryV1[];
  latestPostedAuthority: AccountingPostedCorrectionLatestAuthorityV1 | null;
};

const SUMMARY_SELECT = {
  correctionStableId: true,
  targetKind: true,
  targetStableId: true,
  targetVersion: true,
  status: true,
  reasonCode: true,
  note: true,
  strategy: true,
  targetAuthoritySchema: true,
  targetAuthorityHash: true,
  postedByActorRef: true,
  postedAt: true,
  createdAt: true,
  readyRevision: {
    select: {
      targetAuthoritySchema: true,
      targetAuthorityHash: true,
      targetJson: true,
    },
  },
} satisfies Prisma.AccountingCorrectionCaseSelect;

type SummaryRow = Prisma.AccountingCorrectionCaseGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

const HISTORY_SELECT = {
  correctionStableId: true,
  version: true,
  targetKind: true,
  targetStableId: true,
  targetVersion: true,
  status: true,
  reasonCode: true,
  note: true,
  strategy: true,
  planHash: true,
  readyPreviewJson: true,
  targetAuthoritySchema: true,
  targetAuthorityHash: true,
  createdByActorRef: true,
  readyByActorRef: true,
  readyAt: true,
  postedByActorRef: true,
  postedAt: true,
  cancelledByActorRef: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  readyRevision: {
    select: {
      targetAuthoritySchema: true,
      targetAuthorityHash: true,
      targetJson: true,
    },
  },
  revisions: {
    orderBy: { revision: 'asc' as const },
    select: {
      correctionRevisionStableId: true,
      revision: true,
      targetAuthoritySchema: true,
      targetAuthorityHash: true,
      targetJson: true,
      createdByActorRef: true,
      createdAt: true,
    },
  },
  journalOutputs: {
    orderBy: [{ role: 'asc' as const }, { sequence: 'asc' as const }],
    select: {
      outputStableId: true,
      role: true,
      sequence: true,
      journalEntry: {
        select: {
          entryStableId: true,
          occurredAt: true,
          currency: true,
          memo: true,
          lines: {
            orderBy: { lineNo: 'asc' as const },
            select: {
              lineNo: true,
              debitCents: true,
              creditCents: true,
              account: {
                select: {
                  accountStableId: true,
                  name: true,
                },
              },
              category: {
                select: {
                  categoryStableId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountingCorrectionCaseSelect;

export type AccountingPostedCorrectionHistoryRow =
  Prisma.AccountingCorrectionCaseGetPayload<{
    select: typeof HISTORY_SELECT;
  }>;

export type AccountingPostedCorrectionHistoryCaseV1 = {
  correctionStableId: string;
  version: number;
  targetVersion: number;
  status: string;
  reasonCode: string;
  note: string | null;
  strategy: string | null;
  planHash: string | null;
  readyPreview: AccountingPostedCorrectionPreviewPlanV1 | null;
  targetAuthoritySchema: string | null;
  targetAuthorityHash: string | null;
  createdByActorRef: string;
  readyByActorRef: string | null;
  readyAt: string | null;
  postedByActorRef: string | null;
  postedAt: string | null;
  cancelledByActorRef: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{
    correctionRevisionStableId: string;
    revision: number;
    targetAuthoritySchema: string;
    targetAuthorityHash: string;
    targetJson: Prisma.JsonValue;
    createdByActorRef: string;
    createdAt: string;
  }>;
  journalOutputs: Array<{
    outputStableId: string;
    role: string;
    sequence: number;
    journal: {
      entryStableId: string;
      occurredAt: string;
      currency: string;
      memo: string | null;
      lines: Array<{
        lineNo: number;
        accountStableId: string;
        accountName: string;
        categoryStableId: string | null;
        categoryName: string | null;
        debitCents: number;
        creditCents: number;
      }>;
    };
  }>;
};

export const accountingPostedCorrectionTargetKey = (
  target: AccountingPostedCorrectionTargetRef,
): string =>
  [target.targetKind, target.targetStableId, String(target.targetVersion)].join(
    '|',
  );

const normalizeRefs = (
  refs: AccountingPostedCorrectionTargetRef[],
): AccountingPostedCorrectionTargetRef[] => {
  const unique = new Map<string, AccountingPostedCorrectionTargetRef>();
  for (const ref of refs) {
    unique.set(accountingPostedCorrectionTargetKey(ref), ref);
  }
  return Array.from(unique.values());
};

const whereForRefs = (
  refs: AccountingPostedCorrectionTargetRef[],
): Prisma.AccountingCorrectionCaseWhereInput => {
  const byKind = new Map<AccountingPostedCorrectionTargetKind, string[]>();
  for (const ref of refs) {
    const values = byKind.get(ref.targetKind) ?? [];
    values.push(ref.targetStableId);
    byKind.set(ref.targetKind, values);
  }
  return {
    OR: Array.from(byKind.entries()).map(([targetKind, stableIds]) => ({
      targetKind,
      targetStableId: { in: Array.from(new Set(stableIds)) },
    })),
  };
};

const belongsToRef = (
  row: {
    targetKind: string;
    targetStableId: string;
    targetVersion: number;
  },
  refsByKey: Map<string, AccountingPostedCorrectionTargetRef>,
): boolean =>
  refsByKey.has(
    accountingPostedCorrectionTargetKey({
      targetKind: row.targetKind as AccountingPostedCorrectionTargetKind,
      targetStableId: row.targetStableId,
      targetVersion: row.targetVersion,
    }),
  );

const assertPostedAuthority = (
  row: SummaryRow | AccountingPostedCorrectionHistoryRow,
): AccountingPostedCorrectionLatestAuthorityV1 => {
  if (
    row.status !== AccountingPostedCorrectionStatus.POSTED ||
    !row.postedAt ||
    !row.postedByActorRef ||
    !row.targetAuthoritySchema ||
    !row.targetAuthorityHash ||
    !row.readyRevision ||
    row.readyRevision.targetAuthoritySchema !== row.targetAuthoritySchema ||
    row.readyRevision.targetAuthorityHash !== row.targetAuthorityHash
  ) {
    throw new ConflictException(
      'POSTED correction is missing consistent typed current-effective authority',
    );
  }
  return {
    correctionStableId: row.correctionStableId,
    targetAuthoritySchema: row.targetAuthoritySchema,
    targetAuthorityHash: row.targetAuthorityHash,
    targetJson: row.readyRevision.targetJson,
    postedAt: row.postedAt.toISOString(),
    postedByActorRef: row.postedByActorRef,
  };
};

const laterPosted = (
  left: AccountingPostedCorrectionLatestAuthorityV1 | null,
  right: AccountingPostedCorrectionLatestAuthorityV1,
): AccountingPostedCorrectionLatestAuthorityV1 => {
  if (!left) return right;
  return right.postedAt > left.postedAt ||
    (right.postedAt === left.postedAt &&
      right.correctionStableId > left.correctionStableId)
    ? right
    : left;
};

export async function readAccountingPostedCorrectionProjections(
  db: AccountingPostedCorrectionReadDb,
  refsRaw: AccountingPostedCorrectionTargetRef[],
): Promise<Map<string, AccountingPostedCorrectionProjectionV1>> {
  const refs = normalizeRefs(refsRaw);
  const result = new Map<string, AccountingPostedCorrectionProjectionV1>(
    refs.map((target): [string, AccountingPostedCorrectionProjectionV1] => [
      accountingPostedCorrectionTargetKey(target),
      {
        version: 1,
        target,
        cases: [],
        latestPostedAuthority: null,
      },
    ]),
  );
  if (refs.length === 0) return result;

  const refsByKey = new Map(
    refs.map((ref) => [accountingPostedCorrectionTargetKey(ref), ref] as const),
  );
  const rows = await db.accountingCorrectionCase.findMany({
    where: whereForRefs(refs),
    select: SUMMARY_SELECT,
    orderBy: [
      { targetKind: 'asc' },
      { targetStableId: 'asc' },
      { targetVersion: 'asc' },
      { createdAt: 'asc' },
      { correctionStableId: 'asc' },
    ],
  });

  for (const row of rows) {
    if (!belongsToRef(row, refsByKey)) continue;
    const key = accountingPostedCorrectionTargetKey({
      targetKind: row.targetKind as AccountingPostedCorrectionTargetKind,
      targetStableId: row.targetStableId,
      targetVersion: row.targetVersion,
    });
    const projection = result.get(key);
    if (!projection) continue;
    projection.cases.push({
      correctionStableId: row.correctionStableId,
      status: row.status,
      reasonCode: row.reasonCode,
      note: row.note,
      strategy: row.strategy,
      createdAt: row.createdAt.toISOString(),
      postedAt: row.postedAt?.toISOString() ?? null,
      postedByActorRef: row.postedByActorRef,
    });
    if (row.status === AccountingPostedCorrectionStatus.POSTED) {
      projection.latestPostedAuthority = laterPosted(
        projection.latestPostedAuthority,
        assertPostedAuthority(row),
      );
    }
  }
  return result;
}

const serializeHistoryCase = (
  row: AccountingPostedCorrectionHistoryRow,
): AccountingPostedCorrectionHistoryCaseV1 => ({
  correctionStableId: row.correctionStableId,
  version: row.version,
  targetVersion: row.targetVersion,
  status: row.status,
  reasonCode: row.reasonCode,
  note: row.note,
  strategy: row.strategy,
  planHash: row.planHash,
  readyPreview: row.readyPreviewJson
    ? (row.readyPreviewJson as unknown as AccountingPostedCorrectionPreviewPlanV1)
    : null,
  targetAuthoritySchema: row.targetAuthoritySchema,
  targetAuthorityHash: row.targetAuthorityHash,
  createdByActorRef: row.createdByActorRef,
  readyByActorRef: row.readyByActorRef,
  readyAt: row.readyAt?.toISOString() ?? null,
  postedByActorRef: row.postedByActorRef,
  postedAt: row.postedAt?.toISOString() ?? null,
  cancelledByActorRef: row.cancelledByActorRef,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  revisions: row.revisions.map((revision) => ({
    correctionRevisionStableId: revision.correctionRevisionStableId,
    revision: revision.revision,
    targetAuthoritySchema: revision.targetAuthoritySchema,
    targetAuthorityHash: revision.targetAuthorityHash,
    targetJson: revision.targetJson,
    createdByActorRef: revision.createdByActorRef,
    createdAt: revision.createdAt.toISOString(),
  })),
  journalOutputs: row.journalOutputs.map((output) => ({
    outputStableId: output.outputStableId,
    role: output.role,
    sequence: output.sequence,
    journal: {
      entryStableId: output.journalEntry.entryStableId,
      occurredAt: output.journalEntry.occurredAt.toISOString(),
      currency: output.journalEntry.currency,
      memo: output.journalEntry.memo,
      lines: output.journalEntry.lines.map((line) => ({
        lineNo: line.lineNo,
        accountStableId: line.account.accountStableId,
        accountName: line.account.name,
        categoryStableId: line.category?.categoryStableId ?? null,
        categoryName: line.category?.name ?? null,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
      })),
    },
  })),
});

export async function readAccountingPostedCorrectionHistories(
  db: AccountingPostedCorrectionReadDb,
  refsRaw: AccountingPostedCorrectionTargetRef[],
): Promise<Map<string, AccountingPostedCorrectionHistoryCaseV1[]>> {
  const refs = normalizeRefs(refsRaw);
  const result = new Map<string, AccountingPostedCorrectionHistoryCaseV1[]>(
    refs.map((ref): [string, AccountingPostedCorrectionHistoryCaseV1[]] => [
      accountingPostedCorrectionTargetKey(ref),
      [],
    ]),
  );
  if (refs.length === 0) return result;

  const refsByKey = new Map(
    refs.map((ref) => [accountingPostedCorrectionTargetKey(ref), ref] as const),
  );
  const rows = await db.accountingCorrectionCase.findMany({
    where: whereForRefs(refs),
    select: HISTORY_SELECT,
    orderBy: [
      { targetKind: 'asc' },
      { targetStableId: 'asc' },
      { targetVersion: 'asc' },
      { createdAt: 'asc' },
      { correctionStableId: 'asc' },
    ],
  });

  for (const row of rows) {
    if (!belongsToRef(row, refsByKey)) continue;
    if (row.status === AccountingPostedCorrectionStatus.POSTED) {
      assertPostedAuthority(row);
    }
    const key = accountingPostedCorrectionTargetKey({
      targetKind: row.targetKind as AccountingPostedCorrectionTargetKind,
      targetStableId: row.targetStableId,
      targetVersion: row.targetVersion,
    });
    result.get(key)?.push(serializeHistoryCase(row));
  }
  return result;
}
