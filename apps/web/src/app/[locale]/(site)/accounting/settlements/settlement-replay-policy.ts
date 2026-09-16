import type {
  ProviderSettlementDocumentPlan,
  ProviderSettlementShadowPreview,
} from './settlement-model';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;
const PROVIDER_PENDING_ACCOUNTS = new Set([
  'account_clover_pending',
  'account_uber_pending',
  'account_fantuan_pending',
]);

export type ProviderSettlementReplayGateStatus =
  | 'READY'
  | 'BLOCKED'
  | 'COMPLETED';

export type ProviderSettlementReplayGate = {
  status: ProviderSettlementReplayGateStatus;
  blockReasons: string[];
  confirmationPhrase: string;
  summary: {
    providerDocuments: number;
    reversalJournals: number;
    totalJournals: number;
    providerDebitCents: number;
    providerCreditCents: number;
    reversalDebitCents: number;
    reversalCreditCents: number;
    providerPendingNetCents: number | null;
  };
};

function buildConfirmationPhrase(
  document: ProviderSettlementDocumentPlan | null,
): string {
  if (!document?.periodStart || !document.periodEnd) {
    return 'REPLAY PROVIDER SETTLEMENT';
  }

  const start = new Date(`${document.periodStart}T00:00:00.000Z`);
  const end = new Date(`${document.periodEnd}T00:00:00.000Z`);
  const year = start.getUTCFullYear();
  const monthIndex = start.getUTCMonth();
  const expectedMonthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
  const isFullMonth =
    start.getUTCDate() === 1 &&
    end.getTime() === expectedMonthEnd.getTime();

  if (isFullMonth) {
    return `REPLAY ${MONTH_NAMES[monthIndex]} ${year}`;
  }
  return `REPLAY ${document.periodStart} TO ${document.periodEnd}`;
}

function providerPendingNetCents(
  document: ProviderSettlementDocumentPlan | null,
): number | null {
  const pendingLine = document?.draftJournal?.lines.find((line) =>
    PROVIDER_PENDING_ACCOUNTS.has(line.accountStableId),
  );
  if (!pendingLine) return null;
  return (pendingLine.debitCents ?? 0) - (pendingLine.creditCents ?? 0);
}

export function buildProviderSettlementReplayGate(
  preview: ProviderSettlementShadowPreview,
  documentStableId: string,
): ProviderSettlementReplayGate {
  const document =
    preview.providerDocuments.find(
      (candidate) => candidate.documentStableId === documentStableId,
    ) ?? null;
  const reversals = preview.uberPreCutoverOrderReversals;
  const summary = {
    providerDocuments: document ? 1 : 0,
    reversalJournals: reversals.length,
    totalJournals: (document ? 1 : 0) + reversals.length,
    providerDebitCents: document?.debitCents ?? 0,
    providerCreditCents: document?.creditCents ?? 0,
    reversalDebitCents: preview.amounts.readyUberReversalDebitCents,
    reversalCreditCents: preview.amounts.readyUberReversalCreditCents,
    providerPendingNetCents: providerPendingNetCents(document),
  };
  const confirmationPhrase = buildConfirmationPhrase(document);

  const completed = Boolean(
    document &&
      preview.providerDocuments.length === 1 &&
      preview.counts.providerDocuments === 1 &&
      preview.counts.preCutoverUberSaleJournals === reversals.length &&
      document.status === 'ALREADY_POSTED' &&
      reversals.every((reversal) => reversal.status === 'ALREADY_REVERSED') &&
      preview.counts.readyProviderDocuments === 0 &&
      preview.counts.blockedProviderDocuments === 0 &&
      preview.counts.readyUberOrderReversals === 0 &&
      preview.counts.blockedUberOrderReversals === 0,
  );
  if (completed) {
    return {
      status: 'COMPLETED',
      blockReasons: [],
      confirmationPhrase,
      summary,
    };
  }

  const blockReasons: string[] = [];
  if (!SHA256_HEX.test(preview.planHash)) blockReasons.push('PLAN_HASH_INVALID');
  if (!document) blockReasons.push('TARGET_DOCUMENT_NOT_IN_PREVIEW');
  if (preview.providerDocuments.length !== 1) {
    blockReasons.push('EXPECTED_EXACTLY_ONE_PROVIDER_DOCUMENT');
  }
  if (preview.counts.providerDocuments !== preview.providerDocuments.length) {
    blockReasons.push('PROVIDER_DOCUMENT_COUNT_MISMATCH');
  }
  if (preview.counts.readyProviderDocuments !== 1) {
    blockReasons.push('EXPECTED_EXACTLY_ONE_READY_PROVIDER_DOCUMENT');
  }
  if (preview.counts.blockedProviderDocuments !== 0) {
    blockReasons.push('BLOCKED_PROVIDER_DOCUMENT_PRESENT');
  }

  if (document) {
    const reviewEvidence = document.reviewEvidence;
    if (document.status !== 'READY') {
      blockReasons.push(`TARGET_DOCUMENT_STATUS_${document.status}`);
    }
    if (!document.latestRevisionInRequestedRange) {
      blockReasons.push('TARGET_DOCUMENT_NOT_LATEST_REVISION');
    }
    if (reviewEvidence?.status !== 'CONFIRMED') {
      blockReasons.push('TARGET_DOCUMENT_REVIEW_NOT_CONFIRMED');
    }
    if (
      !reviewEvidence ||
      reviewEvidence.materializedEntityType !== 'PROVIDER_FINANCIAL_DOCUMENT' ||
      reviewEvidence.materializedEntityStableId !== documentStableId ||
      !reviewEvidence.reviewedAt ||
      !reviewEvidence.reviewedByUserStableId
    ) {
      blockReasons.push('TARGET_DOCUMENT_REVIEW_LINK_INCOMPLETE');
    }
    if (!document.coverageEvidence) {
      blockReasons.push('TARGET_DOCUMENT_COVERAGE_MISSING');
    }
    if (preview.range.provider !== document.provider) {
      blockReasons.push('PREVIEW_PROVIDER_SCOPE_MISMATCH');
    }
    if (
      !document.periodStart ||
      !document.periodEnd ||
      preview.range.fromDate > document.periodStart ||
      preview.range.toDateExclusive <= document.periodEnd
    ) {
      blockReasons.push('PREVIEW_RANGE_DOES_NOT_CONTAIN_DOCUMENT');
    }
    if (!document.draftJournal) {
      blockReasons.push('PROVIDER_DRAFT_JOURNAL_MISSING');
    } else {
      const draftDebitCents = document.draftJournal.lines.reduce(
        (sum, line) => sum + (line.debitCents ?? 0),
        0,
      );
      const draftCreditCents = document.draftJournal.lines.reduce(
        (sum, line) => sum + (line.creditCents ?? 0),
        0,
      );
      if (
        draftDebitCents !== document.debitCents ||
        draftCreditCents !== document.creditCents
      ) {
        blockReasons.push('PROVIDER_DRAFT_LINE_TOTAL_MISMATCH');
      }
    }
    if (document.debitCents !== document.creditCents) {
      blockReasons.push('PROVIDER_DRAFT_JOURNAL_UNBALANCED');
    }
    if (
      preview.amounts.readyProviderDebitCents !== document.debitCents ||
      preview.amounts.readyProviderCreditCents !== document.creditCents
    ) {
      blockReasons.push('PROVIDER_PREVIEW_TOTAL_MISMATCH');
    }
    if (summary.providerPendingNetCents === null) {
      blockReasons.push('PROVIDER_PENDING_LINE_MISSING');
    }
  }

  if (preview.counts.preCutoverUberSaleJournals !== reversals.length) {
    blockReasons.push('REVERSAL_CANDIDATE_COUNT_MISMATCH');
  }
  if (preview.counts.readyUberOrderReversals !== reversals.length) {
    blockReasons.push('NOT_ALL_REVERSALS_READY');
  }
  if (preview.counts.blockedUberOrderReversals !== 0) {
    blockReasons.push('BLOCKED_REVERSAL_PRESENT');
  }
  if (reversals.some((reversal) => reversal.status !== 'READY')) {
    blockReasons.push('NON_READY_REVERSAL_PRESENT');
  }
  if (
    reversals.some(
      (reversal) => reversal.coveredByDocumentStableId !== documentStableId,
    )
  ) {
    blockReasons.push('REVERSAL_COVERAGE_MISMATCH');
  }
  if (reversals.some((reversal) => reversal.debitCents !== reversal.creditCents)) {
    blockReasons.push('REVERSAL_DRAFT_JOURNAL_UNBALANCED');
  }
  const reversalDebitCents = reversals.reduce(
    (sum, reversal) => sum + reversal.debitCents,
    0,
  );
  const reversalCreditCents = reversals.reduce(
    (sum, reversal) => sum + reversal.creditCents,
    0,
  );
  if (
    reversalDebitCents !== preview.amounts.readyUberReversalDebitCents ||
    reversalCreditCents !== preview.amounts.readyUberReversalCreditCents
  ) {
    blockReasons.push('REVERSAL_PREVIEW_TOTAL_MISMATCH');
  }
  if (
    preview.amounts.readyUberReversalDebitCents !==
    preview.amounts.readyUberReversalCreditCents
  ) {
    blockReasons.push('REVERSAL_PREVIEW_TOTAL_UNBALANCED');
  }

  return {
    status: blockReasons.length === 0 ? 'READY' : 'BLOCKED',
    blockReasons: Array.from(new Set(blockReasons)).sort(),
    confirmationPhrase,
    summary,
  };
}
