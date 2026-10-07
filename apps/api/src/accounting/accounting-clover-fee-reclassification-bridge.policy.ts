import {
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import type { AccountingPostedCorrectionPostedJournalAnchorV1 } from './accounting-posted-financial-correction.contract';
import {
  AccountingPostedFinancialCorrectionPolicyError,
  buildPostedCorrectionPostedJournalSetSnapshot,
  buildPostedCorrectionTargetJournalSetSnapshot,
  hashPostedCorrectionPostingVector,
} from './accounting-posted-financial-correction.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import { ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS } from './accounting-provider-accounts';
import {
  CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
  CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-clearing.contract';

export class AccountingCloverFeeReclassificationBridgePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingCloverFeeReclassificationBridgePolicyError';
  }
}

const postedAnchorToCreateInput = (
  journal: AccountingPostedCorrectionPostedJournalAnchorV1,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt,
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

// @compat accounting.clover-fee-reclassification-bridge.v1
export const assertLegacyCloverFeeReclassificationBridge = (input: {
  documentStableId: string;
  documentRevision: number;
  originalProviderJournal: AccountingPostedCorrectionPostedJournalAnchorV1;
  specializedJournal: AccountingPostedCorrectionPostedJournalAnchorV1;
  rebuiltProviderJournal: AccountingJournalCreateInput;
}): void => {
  const pendingAccountStableId =
    ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[AccountingFinancialProvider.CLOVER];
  const journal = input.specializedJournal;
  const [pendingLine, payableLine] = journal.lines;
  const amountCents = pendingLine?.debitCents ?? 0;
  const expectedIdempotencyKey =
    `clover-fee-pending-reclass:${input.documentStableId}:` +
    `r${input.documentRevision}:v1`;

  if (
    journal.version !== 1 ||
    journal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
    journal.source !== AccountingJournalSource.PLATFORM_STATEMENT ||
    journal.sourceFactType !== CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE ||
    journal.sourceFactStableId !== input.documentStableId ||
    journal.sourceFactVersion !== input.documentRevision ||
    journal.idempotencyKey !== expectedIdempotencyKey ||
    journal.storeStableId !== input.originalProviderJournal.storeStableId ||
    journal.occurredAt !== input.originalProviderJournal.occurredAt ||
    journal.currency !== input.originalProviderJournal.currency ||
    journal.lines.length !== 2 ||
    !pendingLine ||
    pendingLine.lineNo !== 1 ||
    pendingLine.accountStableId !== pendingAccountStableId ||
    pendingLine.categoryStableId !== null ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    pendingLine.creditCents !== 0 ||
    pendingLine.memo !== 'Restore Clover sales Pending' ||
    !payableLine ||
    payableLine.lineNo !== 2 ||
    payableLine.accountStableId !== CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID ||
    payableLine.categoryStableId !== null ||
    payableLine.debitCents !== 0 ||
    payableLine.creditCents !== amountCents ||
    payableLine.memo !== 'Recognize Clover fee payable'
  ) {
    throw new AccountingCloverFeeReclassificationBridgePolicyError(
      'specialized Clover fee reclassification Journal is not a valid legacy compatibility bridge',
    );
  }

  const expectedJournal: AccountingJournalCreateInput = {
    idempotencyKey: expectedIdempotencyKey,
    kind: AccountingJournalEntryKind.ADJUSTMENT,
    source: AccountingJournalSource.PLATFORM_STATEMENT,
    sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
    sourceFactStableId: input.documentStableId,
    sourceFactVersion: input.documentRevision,
    storeStableId: input.originalProviderJournal.storeStableId,
    occurredAt: input.originalProviderJournal.occurredAt,
    currency: input.originalProviderJournal.currency,
    memo:
      `Reclass legacy Clover statement fees from Pending to fee payable ` +
      `${input.documentStableId} r${input.documentRevision}`,
    lines: [
      {
        accountStableId: pendingAccountStableId,
        debitCents: amountCents,
        creditCents: 0,
        memo: 'Restore Clover sales Pending',
      },
      {
        accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
        debitCents: 0,
        creditCents: amountCents,
        memo: 'Recognize Clover fee payable',
      },
    ],
  };

  try {
    const actualHash = hashJournalCreatePayload(
      normalizeJournalCreate(postedAnchorToCreateInput(journal)),
    );
    const expectedHash = hashJournalCreatePayload(
      normalizeJournalCreate(expectedJournal),
    );
    if (
      actualHash !== expectedHash ||
      journal.idempotencyHash !== expectedHash
    ) {
      throw new AccountingCloverFeeReclassificationBridgePolicyError(
        'specialized Clover fee reclassification Journal hash is inconsistent',
      );
    }

    const baseline = buildPostedCorrectionPostedJournalSetSnapshot({
      currency: input.originalProviderJournal.currency,
      journals: [input.originalProviderJournal, journal],
      requireNonEmpty: true,
    });
    const rebuilt = buildPostedCorrectionTargetJournalSetSnapshot({
      currency: input.originalProviderJournal.currency,
      journals: [input.rebuiltProviderJournal],
    });
    if (
      hashPostedCorrectionPostingVector(baseline.postingVector) !==
      hashPostedCorrectionPostingVector(rebuilt.postingVector)
    ) {
      throw new AccountingCloverFeeReclassificationBridgePolicyError(
        'legacy Clover fee reclassification does not reconcile the original Journal to current Provider posting policy',
      );
    }
  } catch (error) {
    if (
      error instanceof AccountingJournalPolicyError ||
      error instanceof AccountingPostedFinancialCorrectionPolicyError
    ) {
      throw new AccountingCloverFeeReclassificationBridgePolicyError(
        error.message,
      );
    }
    throw error;
  }
};
