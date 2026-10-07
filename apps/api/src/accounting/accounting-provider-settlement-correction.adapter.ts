import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  AccountingAccountClass,
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingProviderFinancialReviewStatus,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
} from './accounting-posted-financial-correction.contract';
import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionProjections,
} from './accounting-posted-correction-read-model';
import type {
  AccountingPostedCorrectionOwnerActivationInputV1,
  AccountingPostedCorrectionOwnerDbClient,
  AccountingPostedCorrectionOwnerReadyTargetV1,
  AccountingPostedCorrectionOwnerRevisionTargetV1,
  AccountingPostedCorrectionOwnerTargetInputV1,
  AccountingPostedFinancialCorrectionOwnerAdapter,
} from './accounting-posted-financial-correction-owner-adapter';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
  AccountingProviderSettlementCorrectionTargetPolicyError,
  applyProviderSettlementCorrectionTargetInput,
  hashProviderSettlementCorrectionTarget,
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetLineV1,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  buildProviderSettlementDocumentPlan,
  PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
  PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS,
  UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-provider-settlement.policy';
import {
  buildProviderSettlementJournalWriteAuthority,
  hashProviderSettlementJournalWrite,
  normalizeProviderSettlementReplacementGroupAuthority,
  type ProviderFinancialHumanReviewAuthorityV1,
  type ProviderSettlementReplacementGroupAuthorityV1,
  type ProviderSettlementSupplementaryEvidenceAuthorityV1,
} from './accounting-provider-settlement-write-authority';
import {
  AccountingProviderFinancialReviewPolicyError,
  resolveProviderFinancialEffectiveLines,
} from './accounting-provider-financial-review.policy';
import {
  AccountingCloverFeeReclassificationBridgePolicyError,
  assertLegacyCloverFeeReclassificationBridge,
} from './accounting-clover-fee-reclassification-bridge.policy';
import {
  CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-clearing.contract';
import { FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND } from './accounting-fantuan-adjustment-detail.contract';
import { resolveFantuanAdjustmentDetailLines } from './accounting-fantuan-adjustment-detail.policy';

const PROVIDER_DOCUMENT_SELECT = {
  documentStableId: true,
  provider: true,
  documentType: true,
  businessIdentityKey: true,
  revision: true,
  storeStableId: true,
  providerDocumentRef: true,
  periodStart: true,
  periodEnd: true,
  currency: true,
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
    orderBy: { lineNo: 'asc' as const },
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
  },
  reviewRevisions: {
    where: {
      status: AccountingProviderFinancialReviewStatus.CONFIRMED,
    },
    orderBy: { revision: 'desc' as const },
    take: 1,
    select: {
      reviewRevisionStableId: true,
      revision: true,
      reviewHash: true,
      confirmedAt: true,
      confirmedByUserStableId: true,
      effectiveSnapshotParserName: true,
      effectiveLines: {
        orderBy: { lineNo: 'asc' as const },
        select: {
          reviewedLineStableId: true,
          lineNo: true,
          sourceLineStableId: true,
          rawCode: true,
          rawName: true,
          component: true,
          postingTreatment: true,
          taxRole: true,
          amountCents: true,
          occurredAt: true,
        },
      },
      corrections: {
        orderBy: { sourceLineStableId: 'asc' as const },
        select: {
          sourceLineStableId: true,
          reason: true,
          note: true,
          effectiveRawCode: true,
          effectiveRawName: true,
          effectiveComponent: true,
          effectivePostingTreatment: true,
          effectiveTaxRole: true,
          effectiveAmountCents: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingProviderFinancialDocumentSelect;

type ProviderDocumentRow =
  Prisma.AccountingProviderFinancialDocumentGetPayload<{
    select: typeof PROVIDER_DOCUMENT_SELECT;
  }>;

const JOURNAL_SELECT = {
  entryStableId: true,
  idempotencyKey: true,
  idempotencyHash: true,
  version: true,
  kind: true,
  source: true,
  sourceFactType: true,
  sourceFactStableId: true,
  sourceFactVersion: true,
  storeStableId: true,
  occurredAt: true,
  currency: true,
  memo: true,
  deletedAt: true,
  lines: {
    orderBy: { lineNo: 'asc' as const },
    select: {
      lineNo: true,
      debitCents: true,
      creditCents: true,
      memo: true,
      account: {
        select: {
          accountStableId: true,
        },
      },
      category: {
        select: {
          categoryStableId: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingJournalEntrySelect;

type JournalRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof JOURNAL_SELECT;
}>;

type OriginalPostingContext = {
  groupAuthority: ProviderSettlementReplacementGroupAuthorityV1;
  sourcePostingAuthorityHash: string;
  sourceTarget: ProviderSettlementCorrectionTargetV1;
  originalJournals: AccountingPostedCorrectionPostedJournalAnchorV1[];
  targetFrozenReversalJournals: AccountingJournalCreateInput[];
  originalProviderJournal: JournalRow;
};

type CurrentBusinessAuthority = {
  context: OriginalPostingContext;
  baseTarget: ProviderSettlementCorrectionTargetV1;
  baseAuthorityHash: string;
};

const PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS_BY_STABLE_ID: Readonly<
  Record<
    string,
    {
      accountClass: AccountingAccountClass;
      currency: string;
      isActive: boolean;
    }
  >
> = PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS;

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isoDate = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

const requireTargetStableId = (raw: string): string => {
  const value = raw?.trim();
  if (!value) throw new BadRequestException('targetStableId is required');
  if (value.length > 250) {
    throw new BadRequestException(
      'targetStableId must not exceed 250 characters',
    );
  }
  return value;
};

const requireTargetVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException('targetVersion must be a positive integer');
  }
  return value;
};

const journalToCreateInput = (
  journal: JournalRow,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt.toISOString(),
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    accountStableId: line.account.accountStableId,
    categoryStableId: line.category?.categoryStableId ?? null,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

const journalToPostedAnchor = (
  journal: JournalRow,
): AccountingPostedCorrectionPostedJournalAnchorV1 => ({
  entryStableId: journal.entryStableId,
  idempotencyKey: journal.idempotencyKey,
  idempotencyHash: journal.idempotencyHash,
  version: journal.version,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt.toISOString(),
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    lineNo: line.lineNo,
    accountStableId: line.account.accountStableId,
    categoryStableId: line.category?.categoryStableId ?? null,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

const humanReviewAuthority = (
  document: ProviderDocumentRow,
): ProviderFinancialHumanReviewAuthorityV1 | null => {
  const review = document.reviewRevisions[0] ?? null;
  if (!review) return null;
  if (!review.confirmedAt || !review.confirmedByUserStableId) {
    throw new ConflictException(
      'confirmed Provider review authority is incomplete: ' +
        document.documentStableId,
    );
  }
  return {
    reviewRevisionStableId: review.reviewRevisionStableId,
    revision: review.revision,
    reviewHash: review.reviewHash,
    confirmedAt: review.confirmedAt.toISOString(),
    confirmedByUserStableId: review.confirmedByUserStableId,
  };
};

const effectiveLines = (
  document: ProviderDocumentRow,
): ProviderDocumentRow['lines'] => {
  const review = document.reviewRevisions[0] ?? null;
  try {
    return resolveProviderFinancialEffectiveLines({
      sourceLines: document.lines,
      review: review
        ? {
            effectiveSnapshotParserName: review.effectiveSnapshotParserName,
            effectiveLines: review.effectiveLines,
            corrections: review.corrections.map((correction) => ({
              sourceLineStableId: correction.sourceLineStableId,
              reason: correction.reason,
              note: correction.note,
              effectiveRawCode: correction.effectiveRawCode,
              effectiveRawName: correction.effectiveRawName,
              effectiveComponent: correction.effectiveComponent,
              effectivePostingTreatment: correction.effectivePostingTreatment,
              effectiveTaxRole: correction.effectiveTaxRole,
              effectiveAmountCents: correction.effectiveAmountCents,
            })),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof AccountingProviderFinancialReviewPolicyError) {
      throw new ConflictException(
        error.message + ': ' + document.documentStableId,
      );
    }
    throw error;
  }
};

const assertHumanReviewAuthority = (
  document: ProviderDocumentRow,
  expected: ProviderFinancialHumanReviewAuthorityV1 | undefined,
): void => {
  const actual = humanReviewAuthority(document);
  if (!expected && !actual) return;
  if (
    !expected ||
    !actual ||
    hashAccountingJson(actual) !== hashAccountingJson(expected)
  ) {
    throw new ConflictException(
      'Provider Human Review authority changed after original posting: ' +
        document.documentStableId,
    );
  }
};

const assertInboxReviewAuthority = (
  document: ProviderDocumentRow,
  expected: ProviderSettlementReplacementGroupAuthorityV1['reviewEvidence'],
): void => {
  const actual = document.artifact.inboxItem;
  if (
    !actual ||
    actual.status !== AccountingInboxStatus.CONFIRMED ||
    actual.materializedEntityType !==
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
    actual.materializedEntityStableId !== document.documentStableId ||
    !actual.reviewedAt ||
    !actual.reviewedByUserStableId
  ) {
    throw new ConflictException(
      'Provider document confirmation authority is missing: ' +
        document.documentStableId,
    );
  }
  const normalized = {
    inboxItemStableId: actual.inboxItemStableId,
    status: actual.status,
    materializedEntityType: actual.materializedEntityType,
    materializedEntityStableId: actual.materializedEntityStableId,
    reviewedAt: actual.reviewedAt.toISOString(),
    reviewedByUserStableId: actual.reviewedByUserStableId,
    version: actual.version,
  };
  if (hashAccountingJson(normalized) !== hashAccountingJson(expected)) {
    throw new ConflictException(
      'Provider document confirmation authority changed after original posting: ' +
        document.documentStableId,
    );
  }
};

const assertSupplementaryAuthority = (
  document: ProviderDocumentRow,
  expected: ProviderSettlementSupplementaryEvidenceAuthorityV1,
): void => {
  if (
    document.documentStableId !== expected.documentStableId ||
    document.provider !== expected.provider ||
    document.documentType !== expected.documentType ||
    document.businessIdentityKey !== expected.businessIdentityKey ||
    document.revision !== expected.revision ||
    document.providerDocumentRef !== expected.providerDocumentRef ||
    document.storeStableId !== expected.storeStableId ||
    isoDate(document.periodStart) !== expected.periodStart ||
    isoDate(document.periodEnd) !== expected.periodEnd
  ) {
    throw new ConflictException(
      'Provider supplementary evidence changed after original posting: ' +
        expected.documentStableId,
    );
  }
  const inbox = document.artifact.inboxItem;
  if (
    !inbox ||
    !inbox.reviewedAt ||
    !inbox.reviewedByUserStableId ||
    hashAccountingJson({
      inboxItemStableId: inbox.inboxItemStableId,
      status: inbox.status,
      materializedEntityType: inbox.materializedEntityType,
      materializedEntityStableId: inbox.materializedEntityStableId,
      reviewedAt: inbox.reviewedAt.toISOString(),
      reviewedByUserStableId: inbox.reviewedByUserStableId,
      version: inbox.version,
    }) !== hashAccountingJson(expected.reviewEvidence)
  ) {
    throw new ConflictException(
      'Provider supplementary review authority changed after original posting: ' +
        expected.documentStableId,
    );
  }
  assertHumanReviewAuthority(document, expected.humanReviewRevision);
};

const assertPrimaryDocumentAuthority = (
  document: ProviderDocumentRow,
  group: ProviderSettlementReplacementGroupAuthorityV1,
): void => {
  if (
    document.documentStableId !== group.documentStableId ||
    document.provider !== group.provider ||
    document.documentType !== group.documentType ||
    document.businessIdentityKey !== group.businessIdentityKey ||
    document.revision !== group.revision ||
    document.providerDocumentRef !== group.providerDocumentRef ||
    document.storeStableId !== group.storeStableId ||
    isoDate(document.periodStart) !== group.periodStart ||
    isoDate(document.periodEnd) !== group.periodEnd
  ) {
    throw new ConflictException(
      'Provider document business identity changed after original posting',
    );
  }
  if (
    document.documentType !== AccountingFinancialDocumentType.STATEMENT ||
    document.currency !== 'CAD'
  ) {
    throw new ConflictException(
      'Provider posted correction v1 supports CAD Statement documents only',
    );
  }
  assertInboxReviewAuthority(document, group.reviewEvidence);
  assertHumanReviewAuthority(document, group.humanReviewRevision);
};

const assertSameTargetStructure = (
  source: ProviderSettlementCorrectionTargetV1,
  target: ProviderSettlementCorrectionTargetV1,
): void => {
  if (
    hashAccountingJson(source.document) !==
      hashAccountingJson(target.document) ||
    source.salesAuthority !== target.salesAuthority ||
    hashAccountingJson(source.supplementaryEvidenceDocumentStableIds) !==
      hashAccountingJson(target.supplementaryEvidenceDocumentStableIds) ||
    hashAccountingJson(
      source.historicalReversalOriginalJournalEntryStableIds,
    ) !==
      hashAccountingJson(target.historicalReversalOriginalJournalEntryStableIds)
  ) {
    throw new ConflictException(
      'normal Provider DELTA correction cannot change Provider identity, Store, period, authority, or frozen prerequisites',
    );
  }

  const sourceByLine = new Map(
    source.lines.map((line) => [line.lineStableId, line] as const),
  );
  if (sourceByLine.size !== target.lines.length) {
    throw new ConflictException(
      'normal Provider DELTA correction cannot change effective line identity',
    );
  }
  for (const line of target.lines) {
    const original = sourceByLine.get(line.lineStableId);
    if (
      !original ||
      original.sourceDocumentStableId !== line.sourceDocumentStableId ||
      original.lineNo !== line.lineNo ||
      original.occurredAt !== line.occurredAt
    ) {
      throw new ConflictException(
        'normal Provider DELTA correction cannot change source line provenance',
      );
    }
  }
};

@Injectable()
export class AccountingProviderSettlementCorrectionAdapter implements AccountingPostedFinancialCorrectionOwnerAdapter {
  readonly targetKind =
    AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT;

  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async readCurrentEffectiveTarget(
    targetStableIdRaw: string,
    targetVersionRaw: number,
  ) {
    const targetStableId = requireTargetStableId(targetStableIdRaw);
    const targetVersion = requireTargetVersion(targetVersionRaw);
    const current = await this.readCurrentBusinessAuthority(
      targetStableId,
      targetVersion,
      this.prisma,
    );
    return {
      version: 1 as const,
      targetKind: this.targetKind,
      targetStableId,
      targetVersion,
      targetAuthoritySchema:
        ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: current.baseAuthorityHash,
      targetJson: current.baseTarget,
      draftInput: {
        version: 1 as const,
        expectedBaseAuthorityHash: current.baseAuthorityHash,
        lines: current.baseTarget.lines.map((line) => ({
          lineStableId: line.lineStableId,
          rawCode: line.rawCode,
          rawName: line.rawName,
          component: line.component,
          postingTreatment: line.postingTreatment,
          taxRole: line.taxRole,
          amountCents: line.amountCents,
        })),
      },
    };
  }

  async normalizeRevisionTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerRevisionTargetV1> {
    if (
      input.reasonCode ===
      AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING
    ) {
      throw new BadRequestException(
        'Provider correction B1 normal DELTA does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
      );
    }
    const current = await this.readCurrentBusinessAuthority(
      input.targetStableId,
      input.targetVersion,
      db,
    );
    let target: ProviderSettlementCorrectionTargetV1;
    try {
      target = applyProviderSettlementCorrectionTargetInput({
        base: current.baseTarget,
        input: input.targetJson,
      });
    } catch (error) {
      if (
        error instanceof AccountingProviderSettlementCorrectionTargetPolicyError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    assertSameTargetStructure(current.context.sourceTarget, target);

    return {
      version: 1,
      targetKind: this.targetKind,
      targetStableId: input.targetStableId,
      targetVersion: input.targetVersion,
      targetAuthoritySchema:
        ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: hashProviderSettlementCorrectionTarget(target),
      targetJson: target as unknown as Prisma.InputJsonValue,
    };
  }

  async resolveReadyTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerReadyTargetV1> {
    if (
      input.reasonCode ===
      AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING
    ) {
      throw new ConflictException(
        'Provider correction B1 normal DELTA does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
      );
    }
    const current = await this.readCurrentBusinessAuthority(
      input.targetStableId,
      input.targetVersion,
      db,
    );
    let target: ProviderSettlementCorrectionTargetV1;
    try {
      target = normalizeProviderSettlementCorrectionTarget(
        input.targetJson as ProviderSettlementCorrectionTargetV1,
      );
    } catch (error) {
      if (
        error instanceof AccountingProviderSettlementCorrectionTargetPolicyError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    assertSameTargetStructure(current.context.sourceTarget, target);
    if (target.basedOnAuthorityHash !== current.baseAuthorityHash) {
      throw new ConflictException(
        'Provider correction target was edited from a stale current-effective authority; create a new Revision',
      );
    }

    const targetJournal = this.buildTargetProviderJournal(
      target,
      current.context,
    );
    const targetJournals = [
      targetJournal,
      ...current.context.targetFrozenReversalJournals,
    ];
    await this.assertTargetDimensions(targetJournal, db);

    return {
      version: 1,
      targetKind: this.targetKind,
      targetStableId: input.targetStableId,
      targetVersion: input.targetVersion,
      targetAuthoritySchema:
        ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: hashProviderSettlementCorrectionTarget(target),
      targetJson: target as unknown as Prisma.InputJsonValue,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      baseAuthoritySchema:
        ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
      baseAuthorityHash: current.baseAuthorityHash,
      currency: target.document.currency,
      originalJournals: current.context.originalJournals,
      targetJournals,
    };
  }

  async activateTargetInTx(
    input: AccountingPostedCorrectionOwnerActivationInputV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (
      input.targetAuthoritySchema !==
      ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA
    ) {
      throw new ConflictException(
        'Provider correction activation received an unexpected target schema',
      );
    }
    const target = normalizeProviderSettlementCorrectionTarget(
      input.targetJson as ProviderSettlementCorrectionTargetV1,
    );
    if (
      hashProviderSettlementCorrectionTarget(target) !==
      input.targetAuthorityHash
    ) {
      throw new ConflictException(
        'Provider correction activation target hash changed before POSTED',
      );
    }
    if (
      target.document.documentStableId !== input.targetStableId ||
      target.document.documentRevision !== input.targetVersion
    ) {
      throw new ConflictException(
        'Provider correction activation target identity changed before POSTED',
      );
    }
    const sourceDocument =
      await tx.accountingProviderFinancialDocument.findUnique({
        where: { documentStableId: input.targetStableId },
        select: { revision: true },
      });
    if (!sourceDocument || sourceDocument.revision !== input.targetVersion) {
      throw new ConflictException(
        'Provider correction source document changed before POSTED',
      );
    }
    // Provider source/Human Review rows remain immutable. The common
    // AccountingCorrectionCase POSTED transition is the activation pointer.
  }

  private async readCurrentBusinessAuthority(
    targetStableId: string,
    targetVersion: number,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<CurrentBusinessAuthority> {
    const context = await this.readOriginalPostingContext(
      targetStableId,
      targetVersion,
      db,
    );
    const ref = {
      targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
      targetStableId,
      targetVersion,
    } as const;
    const projections = await readAccountingPostedCorrectionProjections(db, [
      ref,
    ]);
    const latest = projections.get(
      accountingPostedCorrectionTargetKey(ref),
    )?.latestPostedAuthority;
    if (!latest) {
      return {
        context,
        baseTarget: context.sourceTarget,
        baseAuthorityHash: hashProviderSettlementCorrectionTarget(
          context.sourceTarget,
        ),
      };
    }
    if (
      latest.targetAuthoritySchema !==
      ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA
    ) {
      throw new ConflictException(
        'latest POSTED Provider correction is missing typed target authority',
      );
    }

    const baseTarget = normalizeProviderSettlementCorrectionTarget(
      latest.targetJson as unknown as ProviderSettlementCorrectionTargetV1,
    );
    assertSameTargetStructure(context.sourceTarget, baseTarget);
    if (
      hashProviderSettlementCorrectionTarget(baseTarget) !==
      latest.targetAuthorityHash
    ) {
      throw new ConflictException(
        'latest POSTED Provider correction target hash is inconsistent',
      );
    }
    return {
      context,
      baseTarget,
      baseAuthorityHash: latest.targetAuthorityHash,
    };
  }

  private async readOriginalPostingContext(
    documentStableId: string,
    targetVersion: number,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<OriginalPostingContext> {
    const document = await db.accountingProviderFinancialDocument.findUnique({
      where: { documentStableId },
      select: PROVIDER_DOCUMENT_SELECT,
    });
    if (!document) {
      throw new NotFoundException('posted Provider Statement not found');
    }
    if (document.revision !== targetVersion) {
      throw new ConflictException(
        'Provider correction targetVersion does not match document revision',
      );
    }
    const providerJournals = await db.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
        sourceFactStableId: documentStableId,
        sourceFactVersion: targetVersion,
      },
      select: JOURNAL_SELECT,
      orderBy: { entryStableId: 'asc' },
    });
    if (providerJournals.length !== 1) {
      throw new ConflictException(
        'posted Provider Statement requires exactly one original canonical Journal',
      );
    }
    const originalProviderJournal = providerJournals[0];
    if (!originalProviderJournal) {
      throw new ConflictException(
        'posted Provider Statement Journal is missing',
      );
    }

    const groupAuthority = await this.readAndValidateJournalAuthority(
      originalProviderJournal,
      'PROVIDER_DOCUMENT',
      null,
      db,
    );
    assertPrimaryDocumentAuthority(document, groupAuthority);

    if (
      originalProviderJournal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
      originalProviderJournal.source !==
        AccountingJournalSource.PLATFORM_STATEMENT ||
      originalProviderJournal.storeStableId !== groupAuthority.storeStableId ||
      originalProviderJournal.currency !== document.currency
    ) {
      throw new ConflictException(
        'original Provider Statement Journal structural authority is inconsistent',
      );
    }

    const supplementaryAuthorities =
      groupAuthority.supplementaryEvidenceDocuments ?? [];
    if (
      groupAuthority.provider !== AccountingFinancialProvider.FANTUAN &&
      supplementaryAuthorities.length > 0
    ) {
      throw new ConflictException(
        'Provider correction v1 does not support supplementary evidence outside Fantuan',
      );
    }
    const supplementaryDocuments = await Promise.all(
      supplementaryAuthorities.map(async (authority) => {
        const supplementary =
          await db.accountingProviderFinancialDocument.findUnique({
            where: { documentStableId: authority.documentStableId },
            select: PROVIDER_DOCUMENT_SELECT,
          });
        if (!supplementary) {
          throw new ConflictException(
            'frozen Provider supplementary evidence no longer exists: ' +
              authority.documentStableId,
          );
        }
        assertSupplementaryAuthority(supplementary, authority);
        return supplementary;
      }),
    );

    const sourcePostingAuthorityHash = hashAccountingJson(groupAuthority);
    const sourceTarget = this.buildSourceTarget({
      document,
      supplementaryDocuments,
      groupAuthority,
      sourcePostingAuthorityHash,
    });
    const rebuiltOriginalJournal = this.buildProviderJournalForTarget(
      sourceTarget,
      originalProviderJournal.occurredAt,
    );

    const reversalJournals: JournalRow[] = [];
    for (const anchor of groupAuthority.historicalReversalAnchors) {
      const rows = await db.accountingJournalEntry.findMany({
        where: {
          deletedAt: null,
          sourceFactType: UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
          sourceFactStableId: anchor.originalJournalEntryStableId,
          sourceFactVersion: 1,
        },
        select: JOURNAL_SELECT,
        orderBy: { entryStableId: 'asc' },
      });
      if (rows.length !== 1 || !rows[0]) {
        throw new ConflictException(
          'frozen Uber pre-cutover reversal Journal is missing: ' +
            anchor.originalJournalEntryStableId,
        );
      }
      const reversal = rows[0];
      const reversalGroup = await this.readAndValidateJournalAuthority(
        reversal,
        'UBER_PRE_CUTOVER_REVERSAL',
        anchor.originalJournalEntryStableId,
        db,
      );
      if (
        hashAccountingJson(reversalGroup) !== sourcePostingAuthorityHash ||
        reversal.idempotencyKey !==
          'uber-pre-cutover-order-reversal:' +
            anchor.originalJournalEntryStableId +
            ':v1'
      ) {
        throw new ConflictException(
          'frozen Uber pre-cutover reversal authority changed after original posting',
        );
      }
      reversalJournals.push(reversal);
    }

    const legacyCloverFeeReclassification =
      document.provider === AccountingFinancialProvider.CLOVER
        ? await this.readLegacyCloverFeeReclassificationJournal(
            document,
            originalProviderJournal,
            rebuiltOriginalJournal,
            db,
          )
        : null;

    if (!legacyCloverFeeReclassification) {
      if (
        hashJournalCreatePayload(
          normalizeJournalCreate(rebuiltOriginalJournal),
        ) !==
        hashJournalCreatePayload(
          normalizeJournalCreate(journalToCreateInput(originalProviderJournal)),
        )
      ) {
        throw new ConflictException(
          'Provider effective business authority no longer rebuilds the original posted Journal',
        );
      }
    }

    return {
      groupAuthority,
      sourcePostingAuthorityHash,
      sourceTarget,
      originalJournals: [
        journalToPostedAnchor(originalProviderJournal),
        ...(legacyCloverFeeReclassification
          ? [journalToPostedAnchor(legacyCloverFeeReclassification)]
          : []),
        ...reversalJournals.map(journalToPostedAnchor),
      ],
      targetFrozenReversalJournals: reversalJournals.map(journalToCreateInput),
      originalProviderJournal,
    };
  }

  private async readLegacyCloverFeeReclassificationJournal(
    document: ProviderDocumentRow,
    originalProviderJournal: JournalRow,
    rebuiltOriginalJournal: AccountingJournalCreateInput,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<JournalRow | null> {
    const rows = await db.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
        sourceFactStableId: document.documentStableId,
        sourceFactVersion: document.revision,
      },
      select: JOURNAL_SELECT,
      orderBy: { entryStableId: 'asc' },
    });
    if (rows.length === 0) return null;
    if (rows.length !== 1 || !rows[0]) {
      throw new ConflictException(
        'posted Clover Statement has multiple specialized fee reclassification Journals',
      );
    }

    const journal = rows[0];
    try {
      assertLegacyCloverFeeReclassificationBridge({
        documentStableId: document.documentStableId,
        documentRevision: document.revision,
        originalProviderJournal: journalToPostedAnchor(originalProviderJournal),
        specializedJournal: journalToPostedAnchor(journal),
        rebuiltProviderJournal: rebuiltOriginalJournal,
      });
    } catch (error) {
      if (
        error instanceof
        AccountingCloverFeeReclassificationBridgePolicyError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    return journal;
  }

  private buildSourceTarget(params: {
    document: ProviderDocumentRow;
    supplementaryDocuments: ProviderDocumentRow[];
    groupAuthority: ProviderSettlementReplacementGroupAuthorityV1;
    sourcePostingAuthorityHash: string;
  }): ProviderSettlementCorrectionTargetV1 {
    const primaryLines = effectiveLines(params.document).map((line) => ({
      sourceDocumentStableId: params.document.documentStableId,
      lineStableId: line.lineStableId,
      lineNo: line.lineNo,
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      taxRole: line.taxRole,
      amountCents: line.amountCents,
      occurredAt: line.occurredAt?.toISOString() ?? null,
    }));
    const supplementaryLines = params.supplementaryDocuments.flatMap(
      (document) =>
        effectiveLines(document).map((line) => ({
          sourceDocumentStableId: document.documentStableId,
          lineStableId: line.lineStableId,
          lineNo: line.lineNo,
          rawCode: line.rawCode,
          rawName: line.rawName,
          component: line.component,
          postingTreatment: line.postingTreatment,
          taxRole: line.taxRole,
          amountCents: line.amountCents,
          occurredAt: line.occurredAt?.toISOString() ?? null,
        })),
    );

    const periodStart = isoDate(params.document.periodStart);
    const periodEnd = isoDate(params.document.periodEnd);
    if (!params.document.storeStableId || !periodStart || !periodEnd) {
      throw new ConflictException(
        'posted Provider Statement is missing immutable Store/period authority',
      );
    }
    return normalizeProviderSettlementCorrectionTarget({
      version: 1,
      document: {
        documentStableId: params.document.documentStableId,
        documentRevision: params.document.revision,
        provider: params.document.provider,
        documentType: params.document.documentType,
        businessIdentityKey: params.document.businessIdentityKey,
        providerDocumentRef: params.document.providerDocumentRef,
        storeStableId: params.document.storeStableId,
        periodStart,
        periodEnd,
        currency: params.document.currency,
        sourcePostingAuthorityHash: params.sourcePostingAuthorityHash,
      },
      salesAuthority: params.groupAuthority.salesAuthority,
      basedOnAuthorityHash: params.sourcePostingAuthorityHash,
      supplementaryEvidenceDocumentStableIds: (
        params.groupAuthority.supplementaryEvidenceDocuments ?? []
      ).map((document) => document.documentStableId),
      historicalReversalOriginalJournalEntryStableIds:
        params.groupAuthority.historicalReversalAnchors.map(
          (anchor) => anchor.originalJournalEntryStableId,
        ),
      lines: [...primaryLines, ...supplementaryLines],
    });
  }

  private buildTargetProviderJournal(
    target: ProviderSettlementCorrectionTargetV1,
    context: OriginalPostingContext,
  ): AccountingJournalCreateInput {
    const journal = this.buildProviderJournalForTarget(
      target,
      context.originalProviderJournal.occurredAt,
    );
    this.assertTargetJournalStructure(context.originalProviderJournal, journal);
    return journal;
  }

  private buildProviderJournalForTarget(
    target: ProviderSettlementCorrectionTargetV1,
    occurredAt: Date,
  ): AccountingJournalCreateInput {
    const settlementLines = this.resolveTargetSettlementLines(target);
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: target.document.documentStableId,
        revision: target.document.documentRevision,
        provider: target.document.provider,
        documentType: target.document.documentType,
        storeStableId: target.document.storeStableId,
        periodStart: target.document.periodStart,
        periodEnd: target.document.periodEnd,
        currency: target.document.currency,
        lines: settlementLines.map((line) => ({
          lineStableId: line.lineStableId,
          lineNo: line.lineNo,
          rawCode: line.rawCode,
          rawName: line.rawName,
          component: line.component,
          postingTreatment: line.postingTreatment,
          amountCents: line.amountCents,
        })),
      },
      salesAuthority: target.salesAuthority,
      occurredAt,
    });
    if (plan.status !== 'READY' || !plan.draftJournal) {
      throw new ConflictException(
        'corrected Provider Statement is not READY: ' +
          plan.blockReasons.join(','),
      );
    }
    return plan.draftJournal;
  }

  private resolveTargetSettlementLines(
    target: ProviderSettlementCorrectionTargetV1,
  ): ProviderSettlementCorrectionTargetLineV1[] {
    const primaryLines = target.lines.filter(
      (line) =>
        line.sourceDocumentStableId === target.document.documentStableId,
    );
    const supplementaryIds = new Set(
      target.supplementaryEvidenceDocumentStableIds,
    );
    const candidateDocuments =
      target.supplementaryEvidenceDocumentStableIds.map((documentStableId) => ({
        documentStableId,
        provider: target.document.provider,
        documentType: AccountingFinancialDocumentType.OTHER,
        evidenceKind: FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
        periodStart: target.document.periodStart,
        periodEnd: target.document.periodEnd,
        isConfirmed: true,
        lines: target.lines.filter(
          (line) => line.sourceDocumentStableId === documentStableId,
        ),
      }));
    const unexpectedSourceDocument = target.lines.find(
      (line) =>
        line.sourceDocumentStableId !== target.document.documentStableId &&
        !supplementaryIds.has(line.sourceDocumentStableId),
    );
    if (unexpectedSourceDocument) {
      throw new ConflictException(
        'Provider correction target contains an unfrozen evidence document',
      );
    }

    const resolution = resolveFantuanAdjustmentDetailLines({
      statement: {
        documentStableId: target.document.documentStableId,
        provider: target.document.provider,
        documentType: target.document.documentType,
        evidenceKind: null,
        periodStart: target.document.periodStart,
        periodEnd: target.document.periodEnd,
        isConfirmed: true,
        lines: primaryLines,
      },
      candidateDocuments,
    });
    if (resolution.blockReasons.length > 0) {
      throw new ConflictException(
        'corrected Fantuan adjustment detail is not READY: ' +
          resolution.blockReasons.join(','),
      );
    }
    if (
      resolution.selectedDetailDocumentStableId &&
      !supplementaryIds.has(resolution.selectedDetailDocumentStableId)
    ) {
      throw new ConflictException(
        'Provider correction cannot introduce new supplementary evidence coverage',
      );
    }
    return resolution.lines;
  }

  private assertTargetJournalStructure(
    original: JournalRow,
    target: AccountingJournalCreateInput,
  ): void {
    if (
      target.idempotencyKey !== original.idempotencyKey ||
      target.kind !== original.kind ||
      target.source !== original.source ||
      target.sourceFactType !== original.sourceFactType ||
      target.sourceFactStableId !== original.sourceFactStableId ||
      target.sourceFactVersion !== original.sourceFactVersion ||
      target.storeStableId !== original.storeStableId ||
      target.occurredAt !== original.occurredAt.toISOString() ||
      target.currency !== original.currency
    ) {
      throw new ConflictException(
        'normal Provider DELTA correction changed canonical Journal structure; use a later structural correction flow',
      );
    }
  }

  private async assertTargetDimensions(
    journal: AccountingJournalCreateInput,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<void> {
    const accountStableIds = Array.from(
      new Set(journal.lines.map((line) => line.accountStableId)),
    );
    const accounts = await db.accountingAccount.findMany({
      where: { accountStableId: { in: accountStableIds } },
      select: {
        accountStableId: true,
        accountClass: true,
        currency: true,
      },
    });
    const byStableId = new Map(
      accounts.map((account) => [account.accountStableId, account] as const),
    );
    for (const accountStableId of accountStableIds) {
      const account = byStableId.get(accountStableId);
      const expected =
        PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS_BY_STABLE_ID[accountStableId];
      if (
        !account ||
        !expected ||
        account.accountClass !== expected.accountClass ||
        account.currency !== expected.currency
      ) {
        throw new ConflictException(
          'Provider correction target account prerequisite is missing or incompatible: ' +
            accountStableId,
        );
      }
    }

    const categoryStableIds = Array.from(
      new Set(
        journal.lines.flatMap((line) =>
          line.categoryStableId ? [line.categoryStableId] : [],
        ),
      ),
    );
    if (categoryStableIds.length === 0) return;
    const categories = await db.accountingCategory.findMany({
      where: { categoryStableId: { in: categoryStableIds } },
      select: { categoryStableId: true },
    });
    if (categories.length !== categoryStableIds.length) {
      throw new ConflictException(
        'Provider correction target references a missing Accounting category',
      );
    }
  }

  private async readAndValidateJournalAuthority(
    journal: JournalRow,
    role: 'PROVIDER_DOCUMENT' | 'UBER_PRE_CUTOVER_REVERSAL',
    originalJournalEntryStableId: string | null,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<ProviderSettlementReplacementGroupAuthorityV1> {
    if (journal.deletedAt) {
      throw new ConflictException(
        'original Provider settlement Journal was deleted',
      );
    }
    const audit = await db.accountingAuditLog.findFirst({
      where: {
        action: 'CREATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: journal.entryStableId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        afterJson: true,
      },
    });
    const writeAuthority = jsonRecord(
      jsonRecord(audit?.afterJson).writeAuthority,
    );
    if (writeAuthority.role !== role) {
      throw new ConflictException(
        'original Provider settlement Journal is missing its typed CREATE authority',
      );
    }
    const rawGroup = writeAuthority.group;
    if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
      throw new ConflictException(
        'original Provider settlement Journal authority is missing its group',
      );
    }

    let group: ProviderSettlementReplacementGroupAuthorityV1;
    try {
      group = normalizeProviderSettlementReplacementGroupAuthority(
        rawGroup as unknown as ProviderSettlementReplacementGroupAuthorityV1,
      );
      const authority = buildProviderSettlementJournalWriteAuthority({
        group,
        role,
        originalJournalEntryStableId,
      });
      const normalizedJournal = normalizeJournalCreate(
        journalToCreateInput(journal),
      );
      if (
        hashProviderSettlementJournalWrite(normalizedJournal, authority) !==
        journal.idempotencyHash
      ) {
        throw new ConflictException(
          'original Provider settlement Journal hash does not match its typed authority',
        );
      }
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    return group;
  }
}
