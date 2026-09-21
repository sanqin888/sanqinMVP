import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import type {
  AccountingJournalCreateInput,
  AccountingJournalLineInput,
} from './accounting-journal-policy';

export const CANONICAL_EXPENSE_SOURCE_FACT_TYPE =
  'accounting.expense_document.v1';

export const CANONICAL_EXPENSE_ACCOUNT_IDS = {
  operatingExpense: 'account_general_operating_expense',
  hstRecoverable: 'account_hst_recoverable',
} as const;

export type CanonicalExpenseJournalPolicyErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'DOCUMENT_AMOUNT_MISMATCH'
  | 'MISSING_SPLITS'
  | 'SPLIT_AMOUNT_MISMATCH'
  | 'MISSING_PAYMENT_ALLOCATION'
  | 'PAYMENT_ALLOCATION_MISMATCH'
  | 'DUPLICATE_PAYMENT_ACCOUNT';

export class CanonicalExpenseJournalPolicyError extends Error {
  constructor(
    public readonly code: CanonicalExpenseJournalPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalExpenseJournalPolicyError';
  }
}

export type CanonicalExpenseFactV1 = {
  version: 1;
  documentStableId: string;
  occurredAt: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  memo: string | null;
  splits: Array<{
    categoryStableId: string;
    amountCents: number;
    taxCents: number;
  }>;
  paymentAllocations: Array<{
    accountStableId: string;
    amountCents: number;
  }>;
};

const requireValue = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new CanonicalExpenseJournalPolicyError(
      'INVALID_AMOUNT',
      `${field} is required`,
    );
  }
  return normalized;
};

const assertMinorUnits = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanonicalExpenseJournalPolicyError(
      'INVALID_AMOUNT',
      `${field} must be a non-negative safe integer`,
    );
  }
};

const safeSum = (values: number[], field: string): number => {
  let total = 0;
  for (const value of values) {
    assertMinorUnits(value, field);
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new CanonicalExpenseJournalPolicyError(
        'INVALID_AMOUNT',
        `${field} exceeds safe integer range`,
      );
    }
  }
  return total;
};

const pushDebit = (
  lines: AccountingJournalLineInput[],
  accountStableId: string,
  debitCents: number,
  memo: string,
  categoryStableId?: string,
): void => {
  if (debitCents <= 0) return;
  lines.push({
    accountStableId,
    ...(categoryStableId ? { categoryStableId } : {}),
    debitCents,
    creditCents: 0,
    memo,
  });
};

const pushCredit = (
  lines: AccountingJournalLineInput[],
  accountStableId: string,
  creditCents: number,
  memo: string,
): void => {
  if (creditCents <= 0) return;
  lines.push({
    accountStableId,
    debitCents: 0,
    creditCents,
    memo,
  });
};

export function buildCanonicalExpenseJournal(
  fact: CanonicalExpenseFactV1,
): AccountingJournalCreateInput {
  const documentStableId = requireValue(
    fact.documentStableId,
    'documentStableId',
  );
  const currency = requireValue(fact.currency, 'currency').toUpperCase();
  if (currency !== 'CAD') {
    throw new CanonicalExpenseJournalPolicyError(
      'INVALID_CURRENCY',
      'canonical Expense Journal currently requires CAD booking currency',
    );
  }

  assertMinorUnits(fact.subtotalCents, 'subtotalCents');
  assertMinorUnits(fact.taxCents, 'taxCents');
  assertMinorUnits(fact.totalCents, 'totalCents');
  if (fact.totalCents <= 0) {
    throw new CanonicalExpenseJournalPolicyError(
      'INVALID_AMOUNT',
      'totalCents must be positive',
    );
  }
  if (fact.subtotalCents + fact.taxCents !== fact.totalCents) {
    throw new CanonicalExpenseJournalPolicyError(
      'DOCUMENT_AMOUNT_MISMATCH',
      `document subtotal(${fact.subtotalCents}) + tax(${fact.taxCents}) != total(${fact.totalCents})`,
    );
  }

  if (!fact.splits.length) {
    throw new CanonicalExpenseJournalPolicyError(
      'MISSING_SPLITS',
      'canonical Expense Journal requires at least one category split',
    );
  }
  const splitSubtotal = safeSum(
    fact.splits.map((split) => split.amountCents),
    'splits.amountCents',
  );
  const splitTax = safeSum(
    fact.splits.map((split) => split.taxCents),
    'splits.taxCents',
  );
  for (const split of fact.splits) {
    requireValue(split.categoryStableId, 'split.categoryStableId');
  }
  if (
    splitSubtotal !== fact.subtotalCents ||
    splitTax !== fact.taxCents ||
    splitSubtotal + splitTax !== fact.totalCents
  ) {
    throw new CanonicalExpenseJournalPolicyError(
      'SPLIT_AMOUNT_MISMATCH',
      'expense category splits do not reconcile to document subtotal/tax/total',
    );
  }

  if (!fact.paymentAllocations.length) {
    throw new CanonicalExpenseJournalPolicyError(
      'MISSING_PAYMENT_ALLOCATION',
      'canonical Expense Journal requires complete payment allocation evidence',
    );
  }
  const seenAccounts = new Set<string>();
  for (const allocation of fact.paymentAllocations) {
    const accountStableId = requireValue(
      allocation.accountStableId,
      'paymentAllocation.accountStableId',
    );
    if (seenAccounts.has(accountStableId)) {
      throw new CanonicalExpenseJournalPolicyError(
        'DUPLICATE_PAYMENT_ACCOUNT',
        `payment account appears more than once: ${accountStableId}`,
      );
    }
    seenAccounts.add(accountStableId);
    if (
      !Number.isSafeInteger(allocation.amountCents) ||
      allocation.amountCents <= 0
    ) {
      throw new CanonicalExpenseJournalPolicyError(
        'INVALID_AMOUNT',
        'payment allocation amountCents must be a positive safe integer',
      );
    }
  }
  const allocatedCents = safeSum(
    fact.paymentAllocations.map((allocation) => allocation.amountCents),
    'paymentAllocations.amountCents',
  );
  if (allocatedCents !== fact.totalCents) {
    throw new CanonicalExpenseJournalPolicyError(
      'PAYMENT_ALLOCATION_MISMATCH',
      `payment allocations(${allocatedCents}) != total(${fact.totalCents})`,
    );
  }

  const lines: AccountingJournalLineInput[] = [];
  for (const split of fact.splits) {
    pushDebit(
      lines,
      CANONICAL_EXPENSE_ACCOUNT_IDS.operatingExpense,
      split.amountCents,
      `Expense ${documentStableId}`,
      split.categoryStableId,
    );
  }
  pushDebit(
    lines,
    CANONICAL_EXPENSE_ACCOUNT_IDS.hstRecoverable,
    fact.taxCents,
    `Recoverable HST/GST for ${documentStableId}`,
  );
  for (const allocation of fact.paymentAllocations) {
    pushCredit(
      lines,
      allocation.accountStableId,
      allocation.amountCents,
      `Expense payment for ${documentStableId}`,
    );
  }

  return {
    idempotencyKey: `canonical-expense:${documentStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.EXPENSE_DOCUMENT,
    sourceFactType: CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
    sourceFactStableId: documentStableId,
    sourceFactVersion: 1,
    storeStableId: null,
    occurredAt: fact.occurredAt,
    currency,
    memo: fact.memo?.trim() || `Expense ${documentStableId}`,
    lines,
  };
}
