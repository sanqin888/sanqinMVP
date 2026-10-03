import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
} from './accounting-external-sales.contract';
import {
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_HST_RECOVERABLE_ACCOUNT_STABLE_ID,
  calculateExternalSaleJournalReceivableCents,
  calculateExternalSaleSettlementJournalAppliedReceivableCents,
} from './accounting-external-sales-settlement-journal-authority';
import { AccountingJournalPolicyError } from './accounting-journal-policy';

export type AccountingExternalSalesQueryJournalIdentityV1 = {
  entryStableId: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  currency: string;
  deletedAt: Date | null;
};

export type AccountingExternalSalesQueryJournalLineV1 = {
  accountStableId: string;
  debitCents: number;
  creditCents: number;
};

export type AccountingExternalSalesQueryReversalAnchorV1 = {
  storeStableId: string;
  reversalStableId: string | null;
  reversalFactHash: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: Date | null;
  reversedByActorRef: string | null;
};

export class AccountingExternalSalesQueryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingExternalSalesQueryPolicyError';
  }
}

const fail = (message: string): never => {
  throw new AccountingExternalSalesQueryPolicyError(message);
};

export const accountingExternalSalesQueryDateOnly = (
  value: Date | null,
): string | null => value?.toISOString().slice(0, 10) ?? null;

export const addAccountingExternalSalesQueryCents = (
  left: number,
  right: number,
  field: string,
): number => {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    fail(`${field} exceeds safe integer range`);
  }
  return sum;
};

export const resolveAccountingExternalSaleSettlementComponentRole = (input: {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
}): 'COLLECTION' | 'EXPENSE' | 'HST_RECOVERABLE' => {
  if (
    input.accountClass === AccountingAccountClass.ASSET &&
    (input.accountType === AccountingAccountType.BANK ||
      input.accountType === AccountingAccountType.CASH)
  ) {
    return 'COLLECTION';
  }
  if (
    input.accountStableId ===
      ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_HST_RECOVERABLE_ACCOUNT_STABLE_ID &&
    input.accountClass === AccountingAccountClass.ASSET &&
    input.accountType === null
  ) {
    return 'HST_RECOVERABLE';
  }
  if (
    ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS.some(
      (accountStableId) => accountStableId === input.accountStableId,
    ) &&
    input.accountClass === AccountingAccountClass.EXPENSE &&
    input.accountType === null
  ) {
    return 'EXPENSE';
  }
  return fail(
    `External Sale settlement component account has an invalid role: ${input.accountStableId}`,
  );
};

const assertCanonicalJournalIdentity = <
  T extends AccountingExternalSalesQueryJournalIdentityV1,
>(input: {
  errorMessage: string;
  storeStableId: string;
  currency: string;
  journalEntryStableId: string | null;
  sourceFactType: string;
  sourceFactStableId: string;
  journal: T | undefined;
}): T => {
  const journal = input.journal;
  if (!journal) {
    fail(input.errorMessage);
  }
  if (
    input.currency !== 'CAD' ||
    !input.journalEntryStableId ||
    journal.deletedAt ||
    journal.source !== AccountingJournalSource.EXTERNAL_SALE ||
    journal.sourceFactType !== input.sourceFactType ||
    journal.sourceFactStableId !== input.sourceFactStableId ||
    journal.sourceFactVersion !== 1 ||
    journal.storeStableId !== input.storeStableId ||
    journal.currency !== 'CAD'
  ) {
    fail(input.errorMessage);
  }
  return journal;
};

export const projectAccountingExternalSaleReceivableCents = (input: {
  externalSaleStableId: string;
  storeStableId: string;
  currency: string;
  journalEntryStableId: string | null;
  journal:
    | (AccountingExternalSalesQueryJournalIdentityV1 & {
        lines: AccountingExternalSalesQueryJournalLineV1[];
      })
    | undefined;
}): number => {
  const journal = assertCanonicalJournalIdentity({
    errorMessage: `External Sale canonical Journal anchor is invalid: ${input.externalSaleStableId}`,
    storeStableId: input.storeStableId,
    currency: input.currency,
    journalEntryStableId: input.journalEntryStableId,
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
    sourceFactStableId: input.externalSaleStableId,
    journal: input.journal,
  });
  try {
    return calculateExternalSaleJournalReceivableCents(journal.lines);
  } catch (error) {
    if (error instanceof AccountingJournalPolicyError) {
      return fail(error.message);
    }
    throw error;
  }
};

export const projectAccountingExternalSaleSettlementAppliedCents = (input: {
  settlementStableId: string;
  storeStableId: string;
  currency: string;
  journalEntryStableId: string | null;
  allocationAmountsCents: number[];
  journal:
    | (AccountingExternalSalesQueryJournalIdentityV1 & {
        lines: AccountingExternalSalesQueryJournalLineV1[];
      })
    | undefined;
}): number => {
  const journal = assertCanonicalJournalIdentity({
    errorMessage: `External Sale settlement Journal anchor is invalid: ${input.settlementStableId}`,
    storeStableId: input.storeStableId,
    currency: input.currency,
    journalEntryStableId: input.journalEntryStableId,
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
    sourceFactStableId: input.settlementStableId,
    journal: input.journal,
  });
  let allocationTotalCents = 0;
  for (const amountCents of input.allocationAmountsCents) {
    allocationTotalCents = addAccountingExternalSalesQueryCents(
      allocationTotalCents,
      amountCents,
      'appliedReceivableCents',
    );
  }

  let journalAppliedCents: number;
  try {
    journalAppliedCents =
      calculateExternalSaleSettlementJournalAppliedReceivableCents(
        journal.lines,
      );
  } catch (error) {
    if (error instanceof AccountingJournalPolicyError) {
      return fail(error.message);
    }
    throw error;
  }
  if (allocationTotalCents !== journalAppliedCents) {
    return fail(
      `External Sale settlement allocation total does not match canonical Journal: ${input.settlementStableId}`,
    );
  }
  return journalAppliedCents;
};

export const resolveAccountingExternalSaleReversalState = (input: {
  target: 'SALE' | 'SETTLEMENT';
  anchor: AccountingExternalSalesQueryReversalAnchorV1;
  journal: AccountingExternalSalesQueryJournalIdentityV1 | undefined;
}): 'ACTIVE' | 'REVERSED' => {
  const markers = [
    input.anchor.reversalStableId,
    input.anchor.reversalFactHash,
    input.anchor.reversalJournalEntryStableId,
    input.anchor.reversedAt,
    input.anchor.reversedByActorRef,
  ];
  const present = markers.filter(Boolean).length;
  if (present === 0) return 'ACTIVE';
  if (present !== markers.length) {
    return fail('External Sales reversal evidence is incomplete');
  }

  const expectedSourceFactType =
    input.target === 'SALE'
      ? ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE
      : ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE;
  const journal = input.journal;
  if (
    !input.anchor.reversalStableId ||
    !input.anchor.reversalJournalEntryStableId ||
    !journal ||
    journal.deletedAt ||
    journal.source !== AccountingJournalSource.EXTERNAL_SALE ||
    journal.sourceFactType !== expectedSourceFactType ||
    journal.sourceFactStableId !== input.anchor.reversalStableId ||
    journal.sourceFactVersion !== 1 ||
    journal.storeStableId !== input.anchor.storeStableId ||
    journal.currency !== 'CAD'
  ) {
    return fail(
      input.target === 'SALE'
        ? 'External Sale reversal Journal anchor is invalid'
        : 'External Sale settlement reversal Journal anchor is invalid',
    );
  }
  return 'REVERSED';
};
