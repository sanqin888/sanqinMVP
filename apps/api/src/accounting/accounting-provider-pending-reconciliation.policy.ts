import {
  AccountingFinancialProvider,
  AccountingJournalSource,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
  type AccountingJournalSource as AccountingJournalSourceValue,
} from './accounting-contracts';
import { providerPendingAccountStableId } from './accounting-provider-accounts';
import type {
  AccountingProviderCoverageStatusV1,
  AccountingProviderPendingReconciliationReportV1,
  AccountingProviderPendingReconciliationRowV1,
  AccountingProviderPendingWarningV1,
} from './accounting-provider-pending-reconciliation.contract';

export const PROVIDER_FINANCIAL_DOCUMENT_SOURCE_FACT_TYPE =
  'accounting.provider_financial_document.v1';
export const UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.uber_pre_cutover_order_reversal.v1';
export const PROVIDER_PAYOUT_RECONCILIATION_SOURCE_FACT_TYPE =
  'accounting.provider_payout.v1';

export type ProviderPendingReconciliationLineV1 = {
  provider: AccountingFinancialProviderValue;
  occurredAt: Date;
  debitCents: number;
  creditCents: number;
  source: AccountingJournalSourceValue;
  sourceFactType: string | null;
  entryStableId: string;
};

export type ProviderPendingCoverageEvidenceV1 = {
  provider: AccountingFinancialProviderValue;
  financialHistoryRequiredFrom: string | null;
  financialCompleteThrough: string | null;
};

type MovementBucket =
  | 'CANONICAL_ORDER'
  | 'PROVIDER_STATEMENT'
  | 'AUTHORITY_ADJUSTMENT'
  | 'PAYOUT'
  | 'OTHER';

const PROVIDERS = [
  AccountingFinancialProvider.CLOVER,
  AccountingFinancialProvider.UBER_EATS,
  AccountingFinancialProvider.FANTUAN,
] as const;

const safeAdd = (left: number, right: number, label: string): number => {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} exceeds safe integer range`);
  }
  return result;
};

const lineMovement = (line: ProviderPendingReconciliationLineV1): number => {
  if (
    !Number.isSafeInteger(line.debitCents) ||
    line.debitCents < 0 ||
    !Number.isSafeInteger(line.creditCents) ||
    line.creditCents < 0
  ) {
    throw new Error(
      'Provider Pending Journal line amounts must be non-negative safe integers',
    );
  }
  if (line.debitCents > 0 && line.creditCents > 0) {
    throw new Error(
      'Provider Pending Journal line cannot contain both debit and credit',
    );
  }
  return line.debitCents - line.creditCents;
};

const bucketFor = (
  line: ProviderPendingReconciliationLineV1,
): MovementBucket => {
  if (line.sourceFactType === PROVIDER_PAYOUT_RECONCILIATION_SOURCE_FACT_TYPE) {
    return 'PAYOUT';
  }
  if (line.sourceFactType === UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE) {
    return 'AUTHORITY_ADJUSTMENT';
  }
  if (
    line.sourceFactType === PROVIDER_FINANCIAL_DOCUMENT_SOURCE_FACT_TYPE ||
    line.source === AccountingJournalSource.PLATFORM_STATEMENT
  ) {
    return 'PROVIDER_STATEMENT';
  }
  if (line.source === AccountingJournalSource.ORDER) {
    return 'CANONICAL_ORDER';
  }
  return 'OTHER';
};

const coverageStatus = (params: {
  effectiveTo: string;
  coverage: ProviderPendingCoverageEvidenceV1 | null;
}): AccountingProviderCoverageStatusV1 => {
  const coverage = params.coverage;
  if (!coverage) return 'UNKNOWN';
  if (
    coverage.financialHistoryRequiredFrom &&
    params.effectiveTo < coverage.financialHistoryRequiredFrom
  ) {
    return 'NOT_APPLICABLE';
  }
  return coverage.financialCompleteThrough &&
    coverage.financialCompleteThrough >= params.effectiveTo
    ? 'COMPLETE'
    : 'INCOMPLETE';
};

const countUniqueEntries = (
  lines: ProviderPendingReconciliationLineV1[],
  bucket: MovementBucket,
): number =>
  new Set(
    lines
      .filter((line) => bucketFor(line) === bucket)
      .map((line) => line.entryStableId),
  ).size;

const sumMovements = (
  lines: ProviderPendingReconciliationLineV1[],
  bucket?: MovementBucket,
): number =>
  lines.reduce((sum, line) => {
    if (bucket && bucketFor(line) !== bucket) return sum;
    return safeAdd(sum, lineMovement(line), 'Provider Pending movement');
  }, 0);

const providerRow = (params: {
  provider: AccountingFinancialProviderValue;
  fromInclusive: Date;
  toExclusive: Date;
  effectiveTo: string;
  lines: ProviderPendingReconciliationLineV1[];
  coverage: ProviderPendingCoverageEvidenceV1 | null;
}): AccountingProviderPendingReconciliationRowV1 => {
  const providerLines = params.lines.filter(
    (line) =>
      line.provider === params.provider &&
      line.occurredAt < params.toExclusive,
  );
  const openingLines = providerLines.filter(
    (line) => line.occurredAt < params.fromInclusive,
  );
  const periodLines = providerLines.filter(
    (line) =>
      line.occurredAt >= params.fromInclusive &&
      line.occurredAt < params.toExclusive,
  );

  const openingBalanceCents = sumMovements(openingLines);
  const canonicalOrderMovementCents = sumMovements(
    periodLines,
    'CANONICAL_ORDER',
  );
  const providerStatementMovementCents = sumMovements(
    periodLines,
    'PROVIDER_STATEMENT',
  );
  const authorityAdjustmentMovementCents = sumMovements(
    periodLines,
    'AUTHORITY_ADJUSTMENT',
  );
  const otherMovementCents = sumMovements(periodLines, 'OTHER');
  const payoutSignedMovementCents = sumMovements(periodLines, 'PAYOUT');
  const payoutReductionCents = -payoutSignedMovementCents;

  const periodNetMovementCents = [
    canonicalOrderMovementCents,
    providerStatementMovementCents,
    authorityAdjustmentMovementCents,
    otherMovementCents,
    payoutSignedMovementCents,
  ].reduce(
    (sum, movement) =>
      safeAdd(sum, movement, 'Provider Pending period net movement'),
    0,
  );
  const closingBalanceCents = safeAdd(
    openingBalanceCents,
    periodNetMovementCents,
    'Provider Pending closing balance',
  );
  const formulaClosingCents = [
    openingBalanceCents,
    canonicalOrderMovementCents,
    providerStatementMovementCents,
    authorityAdjustmentMovementCents,
    otherMovementCents,
    -payoutReductionCents,
  ].reduce(
    (sum, movement) =>
      safeAdd(sum, movement, 'Provider Pending reconciliation formula'),
    0,
  );
  const arithmeticDeltaCents = closingBalanceCents - formulaClosingCents;
  if (arithmeticDeltaCents !== 0) {
    throw new Error(
      `Provider Pending reconciliation arithmetic mismatch for ${params.provider}`,
    );
  }

  const warnings: AccountingProviderPendingWarningV1[] = [];
  if (closingBalanceCents < 0) warnings.push('NEGATIVE_PENDING_BALANCE');
  if (otherMovementCents !== 0) warnings.push('OTHER_LEDGER_MOVEMENT_PRESENT');
  if (payoutReductionCents < 0) warnings.push('PAYOUT_DIRECTION_UNEXPECTED');

  return {
    provider: params.provider,
    pendingAccountStableId: providerPendingAccountStableId(params.provider),
    openingBalanceCents,
    canonicalOrderMovementCents,
    providerStatementMovementCents,
    authorityAdjustmentMovementCents,
    otherMovementCents,
    payoutReductionCents,
    periodNetMovementCents,
    closingBalanceCents,
    arithmeticDeltaCents,
    entryCounts: {
      canonicalOrder: countUniqueEntries(periodLines, 'CANONICAL_ORDER'),
      providerStatement: countUniqueEntries(periodLines, 'PROVIDER_STATEMENT'),
      authorityAdjustment: countUniqueEntries(
        periodLines,
        'AUTHORITY_ADJUSTMENT',
      ),
      payout: countUniqueEntries(periodLines, 'PAYOUT'),
      other: countUniqueEntries(periodLines, 'OTHER'),
    },
    coverage: {
      status: coverageStatus({
        effectiveTo: params.effectiveTo,
        coverage: params.coverage,
      }),
      financialHistoryRequiredFrom:
        params.coverage?.financialHistoryRequiredFrom ?? null,
      financialCompleteThrough:
        params.coverage?.financialCompleteThrough ?? null,
    },
    warnings,
  };
};

const totalField = (
  rows: AccountingProviderPendingReconciliationRowV1[],
  field:
    | 'openingBalanceCents'
    | 'canonicalOrderMovementCents'
    | 'providerStatementMovementCents'
    | 'authorityAdjustmentMovementCents'
    | 'otherMovementCents'
    | 'payoutReductionCents'
    | 'periodNetMovementCents'
    | 'closingBalanceCents'
    | 'arithmeticDeltaCents',
): number =>
  rows.reduce(
    (sum, row) => safeAdd(sum, row[field], `Provider Pending total ${field}`),
    0,
  );

export const projectProviderPendingReconciliation = (params: {
  timezone: string;
  accountingStartDate: string;
  storeStableId: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  fromInclusive: Date;
  toExclusive: Date;
  lines: ProviderPendingReconciliationLineV1[];
  coverage: ProviderPendingCoverageEvidenceV1[];
  provider?: AccountingFinancialProviderValue;
}): AccountingProviderPendingReconciliationReportV1 => {
  const providers = params.provider ? [params.provider] : [...PROVIDERS];
  const coverageByProvider = new Map(
    params.coverage.map((row) => [row.provider, row] as const),
  );
  const rows = providers.map((provider) =>
    providerRow({
      provider,
      fromInclusive: params.fromInclusive,
      toExclusive: params.toExclusive,
      effectiveTo: params.effectiveTo,
      lines: params.lines,
      coverage: coverageByProvider.get(provider) ?? null,
    }),
  );

  return {
    version: 1,
    scope: 'PROVIDER_PENDING_ROLL_FORWARD',
    timezone: params.timezone,
    accountingStartDate: params.accountingStartDate,
    currency: 'CAD',
    storeStableId: params.storeStableId,
    requestedFrom: params.requestedFrom,
    requestedTo: params.requestedTo,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: params.effectiveTo,
    providers: rows,
    totals: {
      openingBalanceCents: totalField(rows, 'openingBalanceCents'),
      canonicalOrderMovementCents: totalField(
        rows,
        'canonicalOrderMovementCents',
      ),
      providerStatementMovementCents: totalField(
        rows,
        'providerStatementMovementCents',
      ),
      authorityAdjustmentMovementCents: totalField(
        rows,
        'authorityAdjustmentMovementCents',
      ),
      otherMovementCents: totalField(rows, 'otherMovementCents'),
      payoutReductionCents: totalField(rows, 'payoutReductionCents'),
      periodNetMovementCents: totalField(rows, 'periodNetMovementCents'),
      closingBalanceCents: totalField(rows, 'closingBalanceCents'),
      arithmeticDeltaCents: totalField(rows, 'arithmeticDeltaCents'),
    },
  };
};
