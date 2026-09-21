import { createHash } from 'node:crypto';

import {
  buildCanonicalExpenseJournal,
  CanonicalExpenseJournalPolicyError,
  type CanonicalExpenseFactV1,
} from './accounting-expense-journal.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type CanonicalExpenseJournalWriteAuthorityV1 = {
  version: 1;
  role: 'EXPENSE_DOCUMENT';
  fact: CanonicalExpenseFactV1;
  splitStableIds: string[];
  paymentAllocationStableIds: string[];
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const requireIsoDateTime = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingJournalPolicyError(
      `${field} must be an ISO date-time value`,
    );
  }
  return parsed.toISOString();
};

const normalizeStableIds = (
  values: string[],
  expectedLength: number,
  field: string,
): string[] => {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new AccountingJournalPolicyError(
      `${field} must match the persisted fact row count`,
    );
  }
  const normalized = values.map((value, index) =>
    requireValue(value, `${field}[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new AccountingJournalPolicyError(`${field} contains duplicates`);
  }
  return normalized;
};

export const normalizeCanonicalExpenseFact = (
  fact: CanonicalExpenseFactV1,
): CanonicalExpenseFactV1 => {
  if (fact.version !== 1) {
    throw new AccountingJournalPolicyError(
      'canonical Expense fact version must be 1',
    );
  }
  const normalized: CanonicalExpenseFactV1 = {
    version: 1,
    documentStableId: requireValue(fact.documentStableId, 'documentStableId'),
    occurredAt: requireIsoDateTime(fact.occurredAt, 'occurredAt'),
    currency: requireValue(fact.currency, 'currency').toUpperCase(),
    subtotalCents: fact.subtotalCents,
    taxCents: fact.taxCents,
    totalCents: fact.totalCents,
    memo: fact.memo?.trim() || null,
    splits: fact.splits.map((split, index) => ({
      categoryStableId: requireValue(
        split.categoryStableId,
        `splits[${index}].categoryStableId`,
      ),
      amountCents: split.amountCents,
      taxCents: split.taxCents,
    })),
    paymentAllocations: fact.paymentAllocations.map((allocation, index) => ({
      accountStableId: requireValue(
        allocation.accountStableId,
        `paymentAllocations[${index}].accountStableId`,
      ),
      amountCents: allocation.amountCents,
    })),
  };
  try {
    buildCanonicalExpenseJournal(normalized);
  } catch (error) {
    if (error instanceof CanonicalExpenseJournalPolicyError) {
      throw new AccountingJournalPolicyError(error.message);
    }
    throw error;
  }
  return normalized;
};

export const normalizeCanonicalExpenseJournalWriteAuthority = (
  authority: CanonicalExpenseJournalWriteAuthorityV1,
): CanonicalExpenseJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'EXPENSE_DOCUMENT') {
    throw new AccountingJournalPolicyError(
      'canonical Expense write authority must be EXPENSE_DOCUMENT v1',
    );
  }
  const fact = normalizeCanonicalExpenseFact(authority.fact);
  return {
    version: 1,
    role: 'EXPENSE_DOCUMENT',
    fact,
    splitStableIds: normalizeStableIds(
      authority.splitStableIds,
      fact.splits.length,
      'splitStableIds',
    ),
    paymentAllocationStableIds: normalizeStableIds(
      authority.paymentAllocationStableIds,
      fact.paymentAllocations.length,
      'paymentAllocationStableIds',
    ),
  };
};

export const buildCanonicalExpenseJournalWritePlan = (input: {
  fact: CanonicalExpenseFactV1;
  splitStableIds: string[];
  paymentAllocationStableIds: string[];
}): {
  journal: AccountingJournalCreateInput;
  authority: CanonicalExpenseJournalWriteAuthorityV1;
} => {
  const authority = normalizeCanonicalExpenseJournalWriteAuthority({
    version: 1,
    role: 'EXPENSE_DOCUMENT',
    fact: input.fact,
    splitStableIds: input.splitStableIds,
    paymentAllocationStableIds: input.paymentAllocationStableIds,
  });
  return {
    journal: buildCanonicalExpenseJournal(authority.fact),
    authority,
  };
};

export const assertCanonicalExpenseJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: CanonicalExpenseJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeCanonicalExpenseJournalWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildCanonicalExpenseJournal(authority.fact),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'canonical Expense Journal does not match its persisted Expense authority',
    );
  }
};

export const hashCanonicalExpenseJournalWriteAuthority = (
  authorityRaw: CanonicalExpenseJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeCanonicalExpenseJournalWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(JSON.stringify(authority))
    .digest('hex');
};

export const hashCanonicalExpenseJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: CanonicalExpenseJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeCanonicalExpenseJournalWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
