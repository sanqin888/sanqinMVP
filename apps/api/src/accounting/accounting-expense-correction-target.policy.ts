import { hashAccountingJson } from './accounting-inbox-core.policy';

export const ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA =
  'accounting.expense-correction-target.v1';

export class AccountingExpenseCorrectionTargetPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingExpenseCorrectionTargetPolicyError';
  }
}

export type AccountingExpenseCorrectionFundingVersion = 1 | 2;

export type AccountingExpenseCorrectionTargetSplitV1 = {
  splitStableId: string;
  categoryStableId: string;
  amountCents: number;
  taxCents: number;
  paidFromAccountStableId: string | null;
};

export type AccountingExpenseCorrectionTargetPaymentAllocationV1 = {
  paymentAllocationStableId: string;
  accountStableId: string;
  amountCents: number;
};

export type AccountingExpenseCorrectionTargetV1 = {
  version: 1;
  document: {
    documentStableId: string;
    fundingAttributionVersion: AccountingExpenseCorrectionFundingVersion;
    occurredAt: string;
    currency: string;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    memo: string | null;
    sourcePostingAuthorityHash: string;
  };
  basedOnAuthorityHash: string;
  splits: AccountingExpenseCorrectionTargetSplitV1[];
  paymentAllocations: AccountingExpenseCorrectionTargetPaymentAllocationV1[];
};

export type AccountingExpenseCorrectionTargetInputV1 = {
  version: 1;
  expectedBaseAuthorityHash: string;
  totalCents: number;
  memo?: string | null;
  splits: Array<{
    splitStableId: string;
    categoryStableId: string;
    amountCents: number;
    taxCents: number;
    paidFromAccountStableId?: string | null;
  }>;
  paymentAllocations?: Array<{
    paymentAllocationStableId: string;
    accountStableId: string;
    amountCents: number;
  }>;
};

const requireValue = (raw: unknown, field: string, maxLength = 250): string => {
  if (typeof raw !== 'string') {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be a string',
    );
  }
  const value = raw.trim();
  if (!value) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' is required',
    );
  }
  if (value.length > maxLength) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must not exceed ' + maxLength + ' characters',
    );
  }
  return value;
};

const optionalText = (
  raw: unknown,
  field: string,
  maxLength = 2_000,
): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be a string or null',
    );
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must not exceed ' + maxLength + ' characters',
    );
  }
  return value || null;
};

const requireSha256 = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be a lowercase SHA-256 hex digest',
    );
  }
  return value;
};

const nonNegativeCents = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be a non-negative safe integer',
    );
  }
  return raw;
};

const positiveCents = (raw: unknown, field: string): number => {
  const value = nonNegativeCents(raw, field);
  if (value <= 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be positive',
    );
  }
  return value;
};

const safeSum = (values: number[], field: string): number => {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new AccountingExpenseCorrectionTargetPolicyError(
        field + ' exceeds safe integer range',
      );
    }
  }
  return total;
};

const fundingVersion = (
  raw: unknown,
  field: string,
): AccountingExpenseCorrectionFundingVersion => {
  if (raw !== 1 && raw !== 2) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be 1 or 2',
    );
  }
  return raw;
};

const isoDateTime = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 100);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      field + ' must be a valid ISO date-time',
    );
  }
  return parsed.toISOString();
};

const normalizeSplit = (
  raw: AccountingExpenseCorrectionTargetSplitV1,
  index: number,
): AccountingExpenseCorrectionTargetSplitV1 => {
  const amountCents = nonNegativeCents(
    raw.amountCents,
    'splits[' + index + '].amountCents',
  );
  const taxCents = nonNegativeCents(
    raw.taxCents,
    'splits[' + index + '].taxCents',
  );
  if (amountCents + taxCents <= 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'splits[' + index + '] must contain a positive amount or tax',
    );
  }
  return {
    splitStableId: requireValue(
      raw.splitStableId,
      'splits[' + index + '].splitStableId',
    ),
    categoryStableId: requireValue(
      raw.categoryStableId,
      'splits[' + index + '].categoryStableId',
    ),
    amountCents,
    taxCents,
    paidFromAccountStableId:
      raw.paidFromAccountStableId == null
        ? null
        : requireValue(
            raw.paidFromAccountStableId,
            'splits[' + index + '].paidFromAccountStableId',
          ),
  };
};

const normalizePaymentAllocation = (
  raw: AccountingExpenseCorrectionTargetPaymentAllocationV1,
  index: number,
): AccountingExpenseCorrectionTargetPaymentAllocationV1 => ({
  paymentAllocationStableId: requireValue(
    raw.paymentAllocationStableId,
    'paymentAllocations[' + index + '].paymentAllocationStableId',
  ),
  accountStableId: requireValue(
    raw.accountStableId,
    'paymentAllocations[' + index + '].accountStableId',
  ),
  amountCents: positiveCents(
    raw.amountCents,
    'paymentAllocations[' + index + '].amountCents',
  ),
});

export const normalizeAccountingExpenseCorrectionTarget = (
  raw: AccountingExpenseCorrectionTargetV1,
): AccountingExpenseCorrectionTargetV1 => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target must be an object',
    );
  }
  if (raw.version !== 1) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target version must be 1',
    );
  }
  if (
    !raw.document ||
    typeof raw.document !== 'object' ||
    Array.isArray(raw.document)
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target document must be an object',
    );
  }
  if (!Array.isArray(raw.splits) || raw.splits.length === 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target requires at least one split',
    );
  }
  if (!Array.isArray(raw.paymentAllocations)) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target paymentAllocations must be an array',
    );
  }

  const splits = raw.splits
    .map((split, index) => normalizeSplit(split, index))
    .sort((left, right) =>
      left.splitStableId.localeCompare(right.splitStableId),
    );
  if (
    new Set(splits.map((split) => split.splitStableId)).size !== splits.length
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target contains duplicate splitStableId values',
    );
  }

  const paymentAllocations = raw.paymentAllocations
    .map((allocation, index) => normalizePaymentAllocation(allocation, index))
    .sort((left, right) =>
      left.paymentAllocationStableId.localeCompare(
        right.paymentAllocationStableId,
      ),
    );
  if (
    new Set(
      paymentAllocations.map(
        (allocation) => allocation.paymentAllocationStableId,
      ),
    ).size !== paymentAllocations.length
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target contains duplicate payment allocation ids',
    );
  }
  if (
    new Set(paymentAllocations.map((allocation) => allocation.accountStableId))
      .size !== paymentAllocations.length
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target contains duplicate payment accounts',
    );
  }

  const fundingAttributionVersion = fundingVersion(
    raw.document.fundingAttributionVersion,
    'document.fundingAttributionVersion',
  );
  if (
    fundingAttributionVersion === 1 &&
    splits.some((split) => split.paidFromAccountStableId !== null)
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense v1 correction target cannot use split-level funding',
    );
  }
  if (fundingAttributionVersion === 2 && paymentAllocations.length > 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense v2 correction target cannot use document-level payment allocations',
    );
  }

  const subtotalCents = safeSum(
    splits.map((split) => split.amountCents),
    'splits.amountCents',
  );
  const taxCents = safeSum(
    splits.map((split) => split.taxCents),
    'splits.taxCents',
  );
  const totalCents = positiveCents(
    raw.document.totalCents,
    'document.totalCents',
  );
  if (subtotalCents + taxCents !== totalCents) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction splits do not reconcile to document total',
    );
  }
  if (
    raw.document.subtotalCents !== subtotalCents ||
    raw.document.taxCents !== taxCents
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction document subtotal/tax must equal the split totals',
    );
  }
  if (
    fundingAttributionVersion === 1 &&
    paymentAllocations.length > 0 &&
    safeSum(
      paymentAllocations.map((allocation) => allocation.amountCents),
      'paymentAllocations.amountCents',
    ) !== totalCents
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense v1 payment allocations must be empty or reconcile to document total',
    );
  }

  const currency = requireValue(
    raw.document.currency,
    'document.currency',
    3,
  ).toUpperCase();
  if (currency !== 'CAD') {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target currently requires CAD booking currency',
    );
  }

  return {
    version: 1,
    document: {
      documentStableId: requireValue(
        raw.document.documentStableId,
        'document.documentStableId',
      ),
      fundingAttributionVersion,
      occurredAt: isoDateTime(raw.document.occurredAt, 'document.occurredAt'),
      currency,
      subtotalCents,
      taxCents,
      totalCents,
      memo: optionalText(raw.document.memo, 'document.memo'),
      sourcePostingAuthorityHash: requireSha256(
        raw.document.sourcePostingAuthorityHash,
        'document.sourcePostingAuthorityHash',
      ),
    },
    basedOnAuthorityHash: requireSha256(
      raw.basedOnAuthorityHash,
      'basedOnAuthorityHash',
    ),
    splits,
    paymentAllocations,
  };
};

export const hashAccountingExpenseCorrectionTarget = (
  target: AccountingExpenseCorrectionTargetV1,
): string => {
  const normalized = normalizeAccountingExpenseCorrectionTarget(target);
  const { basedOnAuthorityHash: lineage, ...authority } = normalized;
  void lineage;
  return hashAccountingJson(authority);
};

const parseInput = (raw: unknown): AccountingExpenseCorrectionTargetInputV1 => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target input must be an object',
    );
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.splits)) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target input must use version 1 with splits',
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'paymentAllocations') &&
    !Array.isArray(record.paymentAllocations)
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'paymentAllocations must be an array',
    );
  }
  return {
    version: 1,
    expectedBaseAuthorityHash: requireSha256(
      record.expectedBaseAuthorityHash,
      'expectedBaseAuthorityHash',
    ),
    totalCents: positiveCents(record.totalCents, 'totalCents'),
    ...(Object.prototype.hasOwnProperty.call(record, 'memo')
      ? { memo: optionalText(record.memo, 'memo') }
      : {}),
    splits: record.splits as AccountingExpenseCorrectionTargetInputV1['splits'],
    ...(Object.prototype.hasOwnProperty.call(record, 'paymentAllocations')
      ? {
          paymentAllocations:
            record.paymentAllocations as AccountingExpenseCorrectionTargetInputV1['paymentAllocations'],
        }
      : {}),
  };
};

export const applyAccountingExpenseCorrectionTargetInput = (params: {
  base: AccountingExpenseCorrectionTargetV1;
  input: unknown;
}): AccountingExpenseCorrectionTargetV1 => {
  const base = normalizeAccountingExpenseCorrectionTarget(params.base);
  const input = parseInput(params.input);
  const currentBaseAuthorityHash = hashAccountingExpenseCorrectionTarget(base);
  if (input.expectedBaseAuthorityHash !== currentBaseAuthorityHash) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction target was edited from a stale current-effective authority',
    );
  }
  if (input.splits.length === 0) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction requires at least one split',
    );
  }

  const baseBySplitStableId = new Map(
    base.splits.map((split) => [split.splitStableId, split] as const),
  );
  const seenSplitStableIds = new Set<string>();
  const splits = input.splits.map((rawSplit, index) => {
    if (!rawSplit || typeof rawSplit !== 'object' || Array.isArray(rawSplit)) {
      throw new AccountingExpenseCorrectionTargetPolicyError(
        'splits[' + index + '] must be an object',
      );
    }
    const splitRecord = rawSplit as Record<string, unknown>;
    const splitStableId = requireValue(
      splitRecord.splitStableId,
      'splits[' + index + '].splitStableId',
    );
    if (seenSplitStableIds.has(splitStableId)) {
      throw new AccountingExpenseCorrectionTargetPolicyError(
        'duplicate Expense correction split: ' + splitStableId,
      );
    }
    seenSplitStableIds.add(splitStableId);
    const baseSplit = baseBySplitStableId.get(splitStableId);
    if (
      base.document.fundingAttributionVersion === 1 &&
      Object.prototype.hasOwnProperty.call(
        splitRecord,
        'paidFromAccountStableId',
      ) &&
      splitRecord.paidFromAccountStableId != null
    ) {
      throw new AccountingExpenseCorrectionTargetPolicyError(
        'Expense v1 correction input cannot use split-level funding',
      );
    }
    const paidFromAccountStableId =
      base.document.fundingAttributionVersion === 1
        ? null
        : Object.prototype.hasOwnProperty.call(
              splitRecord,
              'paidFromAccountStableId',
            ) && splitRecord.paidFromAccountStableId !== undefined
          ? splitRecord.paidFromAccountStableId == null
            ? null
            : requireValue(
                splitRecord.paidFromAccountStableId,
                'splits[' + index + '].paidFromAccountStableId',
              )
          : (baseSplit?.paidFromAccountStableId ?? null);

    return normalizeSplit(
      {
        splitStableId,
        categoryStableId: requireValue(
          splitRecord.categoryStableId,
          'splits[' + index + '].categoryStableId',
        ),
        amountCents: nonNegativeCents(
          splitRecord.amountCents,
          'splits[' + index + '].amountCents',
        ),
        taxCents: nonNegativeCents(
          splitRecord.taxCents,
          'splits[' + index + '].taxCents',
        ),
        paidFromAccountStableId,
      },
      index,
    );
  });

  const subtotalCents = safeSum(
    splits.map((split) => split.amountCents),
    'splits.amountCents',
  );
  const taxCents = safeSum(
    splits.map((split) => split.taxCents),
    'splits.taxCents',
  );
  if (subtotalCents + taxCents !== input.totalCents) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense correction splits do not match totalCents',
    );
  }

  let paymentAllocations = base.paymentAllocations;
  if (base.document.fundingAttributionVersion === 1) {
    if (input.paymentAllocations !== undefined) {
      if (!Array.isArray(input.paymentAllocations)) {
        throw new AccountingExpenseCorrectionTargetPolicyError(
          'paymentAllocations must be an array',
        );
      }
      paymentAllocations = input.paymentAllocations.map((allocation, index) => {
        if (
          !allocation ||
          typeof allocation !== 'object' ||
          Array.isArray(allocation)
        ) {
          throw new AccountingExpenseCorrectionTargetPolicyError(
            'paymentAllocations[' + index + '] must be an object',
          );
        }
        return normalizePaymentAllocation(
          allocation as AccountingExpenseCorrectionTargetPaymentAllocationV1,
          index,
        );
      });
    }
  } else if (
    input.paymentAllocations !== undefined &&
    input.paymentAllocations.length > 0
  ) {
    throw new AccountingExpenseCorrectionTargetPolicyError(
      'Expense v2 correction cannot use paymentAllocations',
    );
  }

  return normalizeAccountingExpenseCorrectionTarget({
    version: 1,
    document: {
      ...base.document,
      subtotalCents,
      taxCents,
      totalCents: input.totalCents,
      memo:
        input.memo !== undefined
          ? optionalText(input.memo, 'memo')
          : base.document.memo,
    },
    basedOnAuthorityHash: currentBaseAuthorityHash,
    splits,
    paymentAllocations,
  });
};

export const toAccountingExpenseCorrectionDraftInput = (
  target: AccountingExpenseCorrectionTargetV1,
): AccountingExpenseCorrectionTargetInputV1 => {
  const normalized = normalizeAccountingExpenseCorrectionTarget(target);
  return {
    version: 1,
    expectedBaseAuthorityHash:
      hashAccountingExpenseCorrectionTarget(normalized),
    totalCents: normalized.document.totalCents,
    memo: normalized.document.memo,
    splits: normalized.splits.map((split) => ({
      splitStableId: split.splitStableId,
      categoryStableId: split.categoryStableId,
      amountCents: split.amountCents,
      taxCents: split.taxCents,
      paidFromAccountStableId: split.paidFromAccountStableId,
    })),
    ...(normalized.document.fundingAttributionVersion === 1
      ? {
          paymentAllocations: normalized.paymentAllocations.map(
            (allocation) => ({
              paymentAllocationStableId: allocation.paymentAllocationStableId,
              accountStableId: allocation.accountStableId,
              amountCents: allocation.amountCents,
            }),
          ),
        }
      : {}),
  };
};
