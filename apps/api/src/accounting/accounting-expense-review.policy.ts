import type {
  AccountingExpensePaymentAllocationInput,
  AccountingExpenseSplitInput,
} from './accounting-expense.contracts';

export class AccountingExpenseReviewPolicyError extends Error {}

export type AccountingExpenseReviewEffectiveInput = {
  occurredAt: string;
  totalCents: number;
  sourceCurrency?: string | null;
  paymentAllocations?: AccountingExpensePaymentAllocationInput[];
  memo?: string | null;
  splits: AccountingExpenseSplitInput[];
};

export type AccountingExpenseReviewDraftInput = {
  expectedInboxVersion: number;
  note?: string | null;
  effective: AccountingExpenseReviewEffectiveInput;
};

export type NormalizedAccountingExpenseReviewEffective = {
  version: 1;
  occurredAt: string;
  totalCents: number;
  sourceCurrency: string | null;
  paymentAllocations: Array<{
    accountStableId: string;
    amountCents: number;
  }>;
  memo: string | null;
  splits: Array<{
    categoryStableId: string;
    amountCents: number;
    taxCents: number;
  }>;
};

const optionalText = (
  value: string | null | undefined,
  maxLength: number,
): string | null => {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new AccountingExpenseReviewPolicyError(
      `text exceeds maximum length ${maxLength}`,
    );
  }
  return normalized;
};

const requireStableId = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AccountingExpenseReviewPolicyError(`${field} is required`);
  }
  if (normalized.length > 160) {
    throw new AccountingExpenseReviewPolicyError(`${field} is too long`);
  }
  return normalized;
};

const requireNonNegativeMoney = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AccountingExpenseReviewPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

const requirePositiveMoney = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new AccountingExpenseReviewPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
  return value;
};

const normalizeDateOnly = (value: string): string => {
  const normalized = value?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.occurredAt must use YYYY-MM-DD',
    );
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.occurredAt is not a valid calendar date',
    );
  }
  return normalized;
};

const normalizeCurrency = (value: string | null | undefined): string | null => {
  if (value == null || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.sourceCurrency must be a 3-letter code',
    );
  }
  return normalized;
};

export function normalizeAccountingExpenseReviewEffective(
  input: AccountingExpenseReviewEffectiveInput,
): NormalizedAccountingExpenseReviewEffective {
  if (!input || typeof input !== 'object') {
    throw new AccountingExpenseReviewPolicyError(
      'effective review is required',
    );
  }

  const totalCents = requirePositiveMoney(
    input.totalCents,
    'effective.totalCents',
  );
  if (!Array.isArray(input.splits) || input.splits.length === 0) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.splits must contain at least one row',
    );
  }
  if (input.splits.length > 100) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.splits cannot exceed 100 rows',
    );
  }

  const splits = input.splits.map((split, index) => ({
    categoryStableId: requireStableId(
      split.categoryStableId,
      `effective.splits[${index}].categoryStableId`,
    ),
    amountCents: requireNonNegativeMoney(
      split.amountCents,
      `effective.splits[${index}].amountCents`,
    ),
    taxCents: requireNonNegativeMoney(
      split.taxCents ?? 0,
      `effective.splits[${index}].taxCents`,
    ),
  }));
  const subtotalCents = splits.reduce(
    (sum, split) => sum + split.amountCents,
    0,
  );
  const taxCents = splits.reduce((sum, split) => sum + split.taxCents, 0);
  if (subtotalCents + taxCents !== totalCents) {
    throw new AccountingExpenseReviewPolicyError(
      `effective expense does not balance: subtotal(${subtotalCents}) + tax(${taxCents}) != total(${totalCents})`,
    );
  }

  const rawAllocations = input.paymentAllocations ?? [];
  if (!Array.isArray(rawAllocations)) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.paymentAllocations must be an array',
    );
  }
  if (rawAllocations.length > 20) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.paymentAllocations cannot exceed 20 rows',
    );
  }
  const seenAccounts = new Set<string>();
  const paymentAllocations = rawAllocations.map((allocation, index) => {
    const accountStableId = requireStableId(
      allocation.accountStableId,
      `effective.paymentAllocations[${index}].accountStableId`,
    );
    if (seenAccounts.has(accountStableId)) {
      throw new AccountingExpenseReviewPolicyError(
        'effective.paymentAllocations must not repeat an account',
      );
    }
    seenAccounts.add(accountStableId);
    return {
      accountStableId,
      amountCents: requirePositiveMoney(
        allocation.amountCents,
        `effective.paymentAllocations[${index}].amountCents`,
      ),
    };
  });
  if (
    paymentAllocations.length > 0 &&
    paymentAllocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0,
    ) !== totalCents
  ) {
    throw new AccountingExpenseReviewPolicyError(
      'effective.paymentAllocations do not match totalCents',
    );
  }

  return {
    version: 1,
    occurredAt: normalizeDateOnly(input.occurredAt),
    totalCents,
    sourceCurrency: normalizeCurrency(input.sourceCurrency),
    paymentAllocations,
    memo: optionalText(input.memo, 2000),
    splits,
  };
}

export function normalizeAccountingExpenseReviewDraft(
  input: AccountingExpenseReviewDraftInput,
) {
  if (
    !Number.isSafeInteger(input.expectedInboxVersion) ||
    input.expectedInboxVersion < 1
  ) {
    throw new AccountingExpenseReviewPolicyError(
      'expectedInboxVersion must be a positive integer',
    );
  }
  return {
    expectedInboxVersion: input.expectedInboxVersion,
    note: optionalText(input.note, 2000),
    effective: normalizeAccountingExpenseReviewEffective(input.effective),
  };
}

export function parseStoredAccountingExpenseReviewEffective(
  value: unknown,
): NormalizedAccountingExpenseReviewEffective {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccountingExpenseReviewPolicyError(
      'stored expense review effective payload is invalid',
    );
  }
  const record = value as Record<string, unknown>;
  const rawSplits = record.splits;
  const rawAllocations = record.paymentAllocations;
  if (!Array.isArray(rawSplits) || !Array.isArray(rawAllocations)) {
    throw new AccountingExpenseReviewPolicyError(
      'stored expense review rows are invalid',
    );
  }
  const splits = rawSplits.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AccountingExpenseReviewPolicyError(
        'stored expense review split is invalid',
      );
    }
    const split = value as Record<string, unknown>;
    return {
      categoryStableId:
        typeof split.categoryStableId === 'string'
          ? split.categoryStableId
          : '',
      amountCents:
        typeof split.amountCents === 'number' ? split.amountCents : Number.NaN,
      taxCents:
        typeof split.taxCents === 'number' ? split.taxCents : Number.NaN,
    };
  });
  const paymentAllocations = rawAllocations.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AccountingExpenseReviewPolicyError(
        'stored expense review payment allocation is invalid',
      );
    }
    const allocation = value as Record<string, unknown>;
    return {
      accountStableId:
        typeof allocation.accountStableId === 'string'
          ? allocation.accountStableId
          : '',
      amountCents:
        typeof allocation.amountCents === 'number'
          ? allocation.amountCents
          : Number.NaN,
    };
  });
  return normalizeAccountingExpenseReviewEffective({
    occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : '',
    totalCents:
      typeof record.totalCents === 'number' ? record.totalCents : Number.NaN,
    sourceCurrency:
      typeof record.sourceCurrency === 'string' ||
      record.sourceCurrency === null
        ? record.sourceCurrency
        : null,
    paymentAllocations,
    memo:
      typeof record.memo === 'string' || record.memo === null
        ? record.memo
        : null,
    splits,
  });
}
