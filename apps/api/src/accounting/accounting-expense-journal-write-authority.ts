import { createHash } from 'node:crypto';

import {
  buildCanonicalExpenseJournal,
  buildCanonicalExpenseJournalsV2,
  CanonicalExpenseJournalPolicyError,
  type CanonicalExpenseFactV1,
  type CanonicalExpenseFactV2,
} from './accounting-expense-journal.policy';
import {
  AccountingAccountClass,
  AccountingAccountType,
  type AccountingAccountClass as AccountingAccountClassValue,
  type AccountingAccountType as AccountingAccountTypeValue,
} from './accounting-contracts';
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

export type CanonicalExpenseFundingAccountFactV2 = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type CanonicalExpenseFundingAccountPrerequisiteV2 = {
  accountStableId: string;
  expected: {
    accountClass: AccountingAccountClassValue;
    accountType: AccountingAccountTypeValue;
    currency: 'CAD';
    isActive: true;
  };
  actual: {
    accountClass: string;
    accountType: string | null;
    currency: string;
    isActive: boolean;
  };
};

export type CanonicalExpenseJournalWriteAuthorityV2 = {
  version: 2;
  role: 'EXPENSE_DOCUMENT';
  fact: CanonicalExpenseFactV2;
  fundingAccountStableId: string;
  fundingAccountPrerequisite: CanonicalExpenseFundingAccountPrerequisiteV2;
};

export type CanonicalExpenseJournalWriteAuthority =
  | CanonicalExpenseJournalWriteAuthorityV1
  | CanonicalExpenseJournalWriteAuthorityV2;

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

export const normalizeCanonicalExpenseFactV2 = (
  fact: CanonicalExpenseFactV2,
): CanonicalExpenseFactV2 => {
  if (fact.version !== 2) {
    throw new AccountingJournalPolicyError(
      'canonical Expense fact version must be 2',
    );
  }
  const normalized: CanonicalExpenseFactV2 = {
    version: 2,
    documentStableId: requireValue(fact.documentStableId, 'documentStableId'),
    occurredAt: requireIsoDateTime(fact.occurredAt, 'occurredAt'),
    currency: requireValue(fact.currency, 'currency').toUpperCase(),
    subtotalCents: fact.subtotalCents,
    taxCents: fact.taxCents,
    totalCents: fact.totalCents,
    memo: fact.memo?.trim() || null,
    splits: fact.splits.map((split, index) => ({
      splitStableId: requireValue(
        split.splitStableId,
        `splits[${index}].splitStableId`,
      ),
      categoryStableId: requireValue(
        split.categoryStableId,
        `splits[${index}].categoryStableId`,
      ),
      paidFromAccountStableId: requireValue(
        split.paidFromAccountStableId,
        `splits[${index}].paidFromAccountStableId`,
      ),
      amountCents: split.amountCents,
      taxCents: split.taxCents,
    })),
  };
  try {
    buildCanonicalExpenseJournalsV2(normalized);
  } catch (error) {
    if (error instanceof CanonicalExpenseJournalPolicyError) {
      throw new AccountingJournalPolicyError(error.message);
    }
    throw error;
  }
  return normalized;
};

const requireOperationalAccountType = (
  value: string | null,
  accountStableId: string,
): AccountingAccountTypeValue => {
  if (
    value === AccountingAccountType.CASH ||
    value === AccountingAccountType.BANK ||
    value === AccountingAccountType.PLATFORM_WALLET
  ) {
    return value;
  }
  throw new AccountingJournalPolicyError(
    `Expense funding account is not an active CAD operational ASSET account: ${accountStableId}`,
  );
};

const buildFundingAccountPrerequisiteV2 = (
  fact: CanonicalExpenseFundingAccountFactV2,
): CanonicalExpenseFundingAccountPrerequisiteV2 => {
  const accountStableId = requireValue(
    fact.accountStableId,
    'fundingAccount.accountStableId',
  );
  const accountType = requireOperationalAccountType(
    fact.accountType,
    accountStableId,
  );
  if (
    fact.accountClass !== AccountingAccountClass.ASSET ||
    fact.currency.trim().toUpperCase() !== 'CAD' ||
    fact.isActive !== true
  ) {
    throw new AccountingJournalPolicyError(
      `Expense funding account is not an active CAD operational ASSET account: ${accountStableId}`,
    );
  }

  return {
    accountStableId,
    expected: {
      accountClass: AccountingAccountClass.ASSET,
      accountType,
      currency: 'CAD',
      isActive: true,
    },
    actual: {
      accountClass: fact.accountClass,
      accountType,
      currency: fact.currency.trim().toUpperCase(),
      isActive: fact.isActive,
    },
  };
};

const normalizeCanonicalExpenseJournalWriteAuthorityV1 = (
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

const normalizeCanonicalExpenseJournalWriteAuthorityV2 = (
  authority: CanonicalExpenseJournalWriteAuthorityV2,
): CanonicalExpenseJournalWriteAuthorityV2 => {
  if (authority.version !== 2 || authority.role !== 'EXPENSE_DOCUMENT') {
    throw new AccountingJournalPolicyError(
      'canonical Expense write authority must be EXPENSE_DOCUMENT v2',
    );
  }
  const fact = normalizeCanonicalExpenseFactV2(authority.fact);
  const fundingAccountStableId = requireValue(
    authority.fundingAccountStableId,
    'fundingAccountStableId',
  );
  if (
    !fact.splits.some(
      (split) => split.paidFromAccountStableId === fundingAccountStableId,
    )
  ) {
    throw new AccountingJournalPolicyError(
      'fundingAccountStableId must exist in the persisted Expense v2 splits',
    );
  }
  const prerequisite = buildFundingAccountPrerequisiteV2({
    accountStableId: authority.fundingAccountPrerequisite.accountStableId,
    accountClass: authority.fundingAccountPrerequisite.actual.accountClass,
    accountType: authority.fundingAccountPrerequisite.actual.accountType,
    currency: authority.fundingAccountPrerequisite.actual.currency,
    isActive: authority.fundingAccountPrerequisite.actual.isActive,
  });
  if (prerequisite.accountStableId !== fundingAccountStableId) {
    throw new AccountingJournalPolicyError(
      'funding account prerequisite does not match the Journal group',
    );
  }
  return {
    version: 2,
    role: 'EXPENSE_DOCUMENT',
    fact,
    fundingAccountStableId,
    fundingAccountPrerequisite: prerequisite,
  };
};

export const normalizeCanonicalExpenseJournalWriteAuthority = (
  authority: CanonicalExpenseJournalWriteAuthority,
): CanonicalExpenseJournalWriteAuthority => {
  if (authority.version === 1) {
    return normalizeCanonicalExpenseJournalWriteAuthorityV1(authority);
  }
  if (authority.version === 2) {
    return normalizeCanonicalExpenseJournalWriteAuthorityV2(authority);
  }
  throw new AccountingJournalPolicyError(
    'canonical Expense write authority has unsupported version',
  );
};

export const buildCanonicalExpenseJournalWritePlan = (input: {
  fact: CanonicalExpenseFactV1;
  splitStableIds: string[];
  paymentAllocationStableIds: string[];
}): {
  journal: AccountingJournalCreateInput;
  authority: CanonicalExpenseJournalWriteAuthorityV1;
} => {
  const authority = normalizeCanonicalExpenseJournalWriteAuthorityV1({
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

export const buildCanonicalExpenseJournalWritePlansV2 = (input: {
  fact: CanonicalExpenseFactV2;
  fundingAccountFacts: CanonicalExpenseFundingAccountFactV2[];
}): Array<{
  journal: AccountingJournalCreateInput;
  authority: CanonicalExpenseJournalWriteAuthorityV2;
}> => {
  const fact = normalizeCanonicalExpenseFactV2(input.fact);
  const journals = buildCanonicalExpenseJournalsV2(fact);
  const fundingAccountStableIds = [
    ...new Set(fact.splits.map((split) => split.paidFromAccountStableId)),
  ].sort((left, right) => left.localeCompare(right));

  const accountFactsByStableId = new Map<
    string,
    CanonicalExpenseFundingAccountFactV2
  >();
  for (const accountFact of input.fundingAccountFacts) {
    const accountStableId = requireValue(
      accountFact.accountStableId,
      'fundingAccount.accountStableId',
    );
    if (accountFactsByStableId.has(accountStableId)) {
      throw new AccountingJournalPolicyError(
        `duplicate Expense funding account fact: ${accountStableId}`,
      );
    }
    accountFactsByStableId.set(accountStableId, accountFact);
  }
  if (accountFactsByStableId.size !== fundingAccountStableIds.length) {
    throw new AccountingJournalPolicyError(
      'Expense funding account facts do not match the persisted split funding groups',
    );
  }

  return fundingAccountStableIds.map((fundingAccountStableId) => {
    const accountFact = accountFactsByStableId.get(fundingAccountStableId);
    if (!accountFact) {
      throw new AccountingJournalPolicyError(
        `missing Expense funding account fact: ${fundingAccountStableId}`,
      );
    }
    const journal = journals.find(
      (candidate) =>
        candidate.idempotencyKey ===
        `canonical-expense:${fact.documentStableId}:funding:${fundingAccountStableId}:v2`,
    );
    if (!journal) {
      throw new AccountingJournalPolicyError(
        `missing Expense v2 Journal group: ${fundingAccountStableId}`,
      );
    }
    const fundingAccountPrerequisite =
      buildFundingAccountPrerequisiteV2(accountFact);
    const authority = normalizeCanonicalExpenseJournalWriteAuthorityV2({
      version: 2,
      role: 'EXPENSE_DOCUMENT',
      fact,
      fundingAccountStableId,
      fundingAccountPrerequisite,
    });
    return {
      journal,
      authority,
    };
  });
};

export const assertCanonicalExpenseJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: CanonicalExpenseJournalWriteAuthority,
): void => {
  const authority =
    normalizeCanonicalExpenseJournalWriteAuthority(authorityRaw);
  const expected =
    authority.version === 1
      ? normalizeJournalCreate(buildCanonicalExpenseJournal(authority.fact))
      : normalizeJournalCreate(
          buildCanonicalExpenseJournalsV2(authority.fact).find(
            (candidate) =>
              candidate.idempotencyKey ===
              `canonical-expense:${authority.fact.documentStableId}:funding:${authority.fundingAccountStableId}:v2`,
          ) ??
            (() => {
              throw new AccountingJournalPolicyError(
                'canonical Expense v2 Journal group is missing from its persisted Expense authority',
              );
            })(),
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
  authorityRaw: CanonicalExpenseJournalWriteAuthority,
): string => {
  const authority =
    normalizeCanonicalExpenseJournalWriteAuthority(authorityRaw);
  return createHash('sha256').update(JSON.stringify(authority)).digest('hex');
};

export const hashCanonicalExpenseJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: CanonicalExpenseJournalWriteAuthority,
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

