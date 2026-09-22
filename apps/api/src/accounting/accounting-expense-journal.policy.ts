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
export const CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2 =
  'accounting.expense_document.v2';

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
  | 'DUPLICATE_PAYMENT_ACCOUNT'
  | 'MISSING_FUNDING_ACCOUNT'
  | 'DUPLICATE_SPLIT_ID';

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

export type CanonicalExpenseFactV2 = {
  version: 2;
  documentStableId: string;
  occurredAt: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  memo: string | null;
  splits: Array<{
    splitStableId: string;
    categoryStableId: string;
    paidFromAccountStableId: string;
    amountCents: number;
    taxCents: number;
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

export function buildCanonicalExpenseJournalsV2(
  fact: CanonicalExpenseFactV2,
): AccountingJournalCreateInput[] {
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

  const seenSplitStableIds = new Set<string>();
  for (const [index, split] of fact.splits.entries()) {
    const splitStableId = requireValue(
      split.splitStableId,
      `splits[${index}].splitStableId`,
    );
    if (seenSplitStableIds.has(splitStableId)) {
      throw new CanonicalExpenseJournalPolicyError(
        'DUPLICATE_SPLIT_ID',
        `splitStableId appears more than once: ${splitStableId}`,
      );
    }
    seenSplitStableIds.add(splitStableId);
    requireValue(split.categoryStableId, `splits[${index}].categoryStableId`);
    if (!split.paidFromAccountStableId?.trim()) {
      throw new CanonicalExpenseJournalPolicyError(
        'MISSING_FUNDING_ACCOUNT',
        `splits[${index}].paidFromAccountStableId is required`,
      );
    }
    const splitTotalCents = safeSum(
      [split.amountCents, split.taxCents],
      `splits[${index}].totalCents`,
    );
    if (splitTotalCents <= 0) {
      throw new CanonicalExpenseJournalPolicyError(
        'INVALID_AMOUNT',
        `splits[${index}] must contain a positive amount or tax`,
      );
    }
  }

  const splitSubtotal = safeSum(
    fact.splits.map((split) => split.amountCents),
    'splits.amountCents',
  );
  const splitTax = safeSum(
    fact.splits.map((split) => split.taxCents),
    'splits.taxCents',
  );
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

  const groups = new Map<
    string,
    {
      accountStableId: string;
      splits: CanonicalExpenseFactV2['splits'];
    }
  >();
  for (const split of fact.splits) {
    const accountStableId = split.paidFromAccountStableId.trim();
    const existing = groups.get(accountStableId);
    if (existing) {
      existing.splits.push(split);
    } else {
      groups.set(accountStableId, {
        accountStableId,
        splits: [split],
      });
    }
  }

  return [...groups.values()]
    .sort((left, right) =>
      left.accountStableId.localeCompare(right.accountStableId),
    )
    .map((group) => {
      const lines: AccountingJournalLineInput[] = [];
      for (const split of group.splits) {
        pushDebit(
          lines,
          CANONICAL_EXPENSE_ACCOUNT_IDS.operatingExpense,
          split.amountCents,
          `Expense ${documentStableId}`,
          split.categoryStableId,
        );
      }
      const groupSubtotalCents = safeSum(
        group.splits.map((split) => split.amountCents),
        'group.splits.amountCents',
      );
      const groupTaxCents = safeSum(
        group.splits.map((split) => split.taxCents),
        'group.splits.taxCents',
      );
      pushDebit(
        lines,
        CANONICAL_EXPENSE_ACCOUNT_IDS.hstRecoverable,
        groupTaxCents,
        `Recoverable HST/GST for ${documentStableId}`,
      );
      const groupTotalCents = safeSum(
        [groupSubtotalCents, groupTaxCents],
        'group.totalCents',
      );
      pushCredit(
        lines,
        group.accountStableId,
        groupTotalCents,
        `Expense payment for ${documentStableId}`,
      );

      return {
        idempotencyKey: `canonical-expense:${documentStableId}:funding:${group.accountStableId}:v2`,
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactType: CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
        sourceFactStableId: documentStableId,
        sourceFactVersion: 2,
        storeStableId: null,
        occurredAt: fact.occurredAt,
        currency,
        memo: fact.memo?.trim() || `Expense ${documentStableId}`,
        lines,
      };
    });
}
