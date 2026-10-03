import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_VERSION,
  type AccountingExternalSaleSettlementFactV1,
} from './accounting-external-sales.contract';
import {
  buildAccountingExternalSaleSettlementPostingDraft,
  hashAccountingExternalSaleSettlementFact,
} from './accounting-external-sales.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

const HST_RECOVERABLE_ACCOUNT_STABLE_ID = 'account_hst_recoverable';

const SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS = new Set([
  'account_commission_expense',
  'account_general_operating_expense',
  'account_platform_promotion_expense',
  'account_advertising_expense',
  'account_payment_processing_fee_expense',
  'account_chargeback_adjustment_expense',
]);

export type ExternalSaleSettlementAccountFactV1 = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type ExternalSaleSettlementAccountRoleV1 =
  | 'ACCOUNTS_RECEIVABLE'
  | 'COLLECTION_ASSET'
  | 'SETTLEMENT_EXPENSE'
  | 'HST_RECOVERABLE';

export type ExternalSaleSettlementAccountPrerequisiteV1 = {
  role: ExternalSaleSettlementAccountRoleV1;
  accountStableId: string;
  expected: {
    accountClass: string;
    accountType: string | null;
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

export type ExternalSaleSettlementReceivableSnapshotV1 = {
  externalSaleStableId: string;
  saleOccurredOn: string;
  storeStableId: string;
  counterpartyName: string;
  currency: 'CAD';
  saleFactHash: string;
  saleJournalEntryStableId: string;
  totalReceivableCents: number;
  settledBeforeCents: number;
  outstandingBeforeCents: number;
};

export type ExternalSaleSettlementReceivablePrerequisiteV1 =
  ExternalSaleSettlementReceivableSnapshotV1 & {
    allocationCents: number;
  };

export type ExternalSaleSettlementJournalWriteAuthorityV1 = {
  version: 1;
  role: 'EXTERNAL_SALE_SETTLEMENT';
  businessTimezone: string;
  fact: AccountingExternalSaleSettlementFactV1;
  factHash: string;
  accountPrerequisites: ExternalSaleSettlementAccountPrerequisiteV1[];
  receivablePrerequisites: ExternalSaleSettlementReceivablePrerequisiteV1[];
};

export type ExternalSaleSettlementWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: ExternalSaleSettlementJournalWriteAuthorityV1;
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const requireNonNegativeMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

const requirePositiveMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
  return value;
};

const normalizeTimezone = (raw: string): string => {
  const timezone = requireValue(raw, 'businessTimezone');
  if (!DateTime.now().setZone(timezone).isValid) {
    throw new AccountingJournalPolicyError(
      `External Sale settlement businessTimezone is invalid: ${timezone}`,
    );
  }
  return timezone;
};

const settlementOccurredAt = (
  settlementOn: string,
  businessTimezone: string,
): string => {
  const local = DateTime.fromISO(settlementOn, {
    zone: businessTimezone,
  }).startOf('day');
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement date/businessTimezone could not be resolved',
    );
  }
  return iso;
};

const accountRole = (
  account: ExternalSaleSettlementAccountFactV1,
): ExternalSaleSettlementAccountRoleV1 => {
  if (
    account.accountStableId === ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID
  ) {
    if (
      account.accountClass !== AccountingAccountClass.ASSET ||
      account.accountType !== null
    ) {
      throw new AccountingJournalPolicyError(
        'External Sale Accounts Receivable must be an ASSET account with no operational type',
      );
    }
    return 'ACCOUNTS_RECEIVABLE';
  }

  if (account.accountStableId === HST_RECOVERABLE_ACCOUNT_STABLE_ID) {
    if (
      account.accountClass !== AccountingAccountClass.ASSET ||
      account.accountType !== null
    ) {
      throw new AccountingJournalPolicyError(
        'External Sale settlement HST recoverable must be an ASSET account with no operational type',
      );
    }
    return 'HST_RECOVERABLE';
  }

  if (SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS.has(account.accountStableId)) {
    if (
      account.accountClass !== AccountingAccountClass.EXPENSE ||
      account.accountType !== null
    ) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement expense account has an unexpected shape: ${account.accountStableId}`,
      );
    }
    return 'SETTLEMENT_EXPENSE';
  }

  if (
    account.accountClass === AccountingAccountClass.ASSET &&
    (account.accountType === AccountingAccountType.BANK ||
      account.accountType === AccountingAccountType.CASH)
  ) {
    return 'COLLECTION_ASSET';
  }

  throw new AccountingJournalPolicyError(
    `External Sale settlement account is not allowed: ${account.accountStableId}`,
  );
};

const buildAccountPrerequisites = (
  fact: AccountingExternalSaleSettlementFactV1,
  accountFacts: ExternalSaleSettlementAccountFactV1[],
): ExternalSaleSettlementAccountPrerequisiteV1[] => {
  const requiredStableIds = [
    ...new Set([
      ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
      ...fact.components.map((component) => component.accountStableId),
    ]),
  ].sort();
  const byStableId = new Map(
    accountFacts.map((account) => [account.accountStableId, account] as const),
  );
  if (
    byStableId.size !== accountFacts.length ||
    byStableId.size !== requiredStableIds.length
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement account facts must exactly match required accounts',
    );
  }

  return requiredStableIds.map((accountStableId) => {
    const actual = byStableId.get(accountStableId);
    if (!actual) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement account is not provisioned: ${accountStableId}`,
      );
    }
    if (actual.currency !== 'CAD' || actual.isActive !== true) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement account must be active CAD: ${accountStableId}`,
      );
    }
    const role = accountRole(actual);
    return {
      role,
      accountStableId,
      expected: {
        accountClass: actual.accountClass,
        accountType: actual.accountType,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: actual.accountClass,
        accountType: actual.accountType,
        currency: actual.currency,
        isActive: actual.isActive,
      },
    };
  });
};

const assertSettlementComponentComposition = (
  fact: AccountingExternalSaleSettlementFactV1,
  prerequisites: ExternalSaleSettlementAccountPrerequisiteV1[],
): void => {
  const roleByAccountStableId = new Map(
    prerequisites.map((item) => [item.accountStableId, item.role] as const),
  );
  let expenseCents = 0;
  let recoverableTaxCents = 0;
  for (const component of fact.components) {
    const role = roleByAccountStableId.get(component.accountStableId);
    if (role === 'SETTLEMENT_EXPENSE') {
      expenseCents += component.amountCents;
    }
    if (role === 'HST_RECOVERABLE') {
      recoverableTaxCents += component.amountCents;
    }
    if (
      !Number.isSafeInteger(expenseCents) ||
      !Number.isSafeInteger(recoverableTaxCents)
    ) {
      throw new AccountingJournalPolicyError(
        'External Sale settlement component totals exceed safe integer range',
      );
    }
  }
  if (recoverableTaxCents > 0 && expenseCents <= 0) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement recoverable tax requires a settlement expense component',
    );
  }
  if (recoverableTaxCents > expenseCents) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement recoverable tax cannot exceed settlement expense principal',
    );
  }
};

const buildReceivablePrerequisites = (
  fact: AccountingExternalSaleSettlementFactV1,
  snapshots: ExternalSaleSettlementReceivableSnapshotV1[],
): ExternalSaleSettlementReceivablePrerequisiteV1[] => {
  const byStableId = new Map(
    snapshots.map(
      (snapshot) => [snapshot.externalSaleStableId, snapshot] as const,
    ),
  );
  if (
    byStableId.size !== snapshots.length ||
    byStableId.size !== fact.allocations.length
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement receivable snapshots must exactly match allocations',
    );
  }

  return fact.allocations.map((allocation) => {
    const snapshot = byStableId.get(allocation.externalSaleStableId);
    if (!snapshot) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement receivable snapshot is missing: ${allocation.externalSaleStableId}`,
      );
    }
    const totalReceivableCents = requirePositiveMoney(
      snapshot.totalReceivableCents,
      'totalReceivableCents',
    );
    const settledBeforeCents = requireNonNegativeMoney(
      snapshot.settledBeforeCents,
      'settledBeforeCents',
    );
    const outstandingBeforeCents = requireNonNegativeMoney(
      snapshot.outstandingBeforeCents,
      'outstandingBeforeCents',
    );
    if (settledBeforeCents + outstandingBeforeCents !== totalReceivableCents) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement receivable snapshot does not reconcile: ${allocation.externalSaleStableId}`,
      );
    }
    if (allocation.amountCents > outstandingBeforeCents) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement allocation exceeds outstanding receivable: ${allocation.externalSaleStableId}`,
      );
    }
    if (
      snapshot.storeStableId !== fact.storeStableId ||
      snapshot.counterpartyName !== fact.counterpartyName ||
      snapshot.currency !== 'CAD'
    ) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement allocation does not match store/counterparty/currency: ${allocation.externalSaleStableId}`,
      );
    }
    if (snapshot.saleOccurredOn > fact.settlementOn) {
      throw new AccountingJournalPolicyError(
        `External Sale settlement date precedes the sale: ${allocation.externalSaleStableId}`,
      );
    }

    return {
      ...snapshot,
      saleFactHash: requireValue(snapshot.saleFactHash, 'saleFactHash'),
      saleJournalEntryStableId: requireValue(
        snapshot.saleJournalEntryStableId,
        'saleJournalEntryStableId',
      ),
      allocationCents: allocation.amountCents,
      totalReceivableCents,
      settledBeforeCents,
      outstandingBeforeCents,
    };
  });
};

const buildJournalFromFact = (
  fact: AccountingExternalSaleSettlementFactV1,
  businessTimezone: string,
): AccountingJournalCreateInput => {
  const draft = buildAccountingExternalSaleSettlementPostingDraft(fact);
  return {
    idempotencyKey: `external-sale-settlement:${fact.settlementStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.EXTERNAL_SALE,
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.settlementStableId,
    sourceFactVersion: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: settlementOccurredAt(fact.settlementOn, businessTimezone),
    currency: 'CAD',
    memo: draft.memo,
    lines: draft.lines,
  };
};

export const calculateExternalSaleJournalReceivableCents = (
  lines: Array<{
    accountStableId: string;
    debitCents: number;
    creditCents: number;
  }>,
): number => {
  const receivableLines = lines.filter(
    (line) =>
      line.accountStableId === ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  );
  if (receivableLines.length !== 1) {
    throw new AccountingJournalPolicyError(
      'External Sale canonical Journal must contain exactly one Accounts Receivable line',
    );
  }
  const receivable = receivableLines[0];
  if (
    !receivable ||
    !Number.isSafeInteger(receivable.debitCents) ||
    !Number.isSafeInteger(receivable.creditCents) ||
    receivable.debitCents <= 0 ||
    receivable.creditCents !== 0
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale canonical Journal has an invalid Accounts Receivable debit',
    );
  }
  return receivable.debitCents;
};

export const buildExternalSaleSettlementWritePlan = (input: {
  fact: AccountingExternalSaleSettlementFactV1;
  businessTimezone: string;
  accountFacts: ExternalSaleSettlementAccountFactV1[];
  receivableSnapshots: ExternalSaleSettlementReceivableSnapshotV1[];
}): ExternalSaleSettlementWritePlanV1 => {
  if (input.fact.replacementForSettlementStableId !== null) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement replacement requires the C3 reversal/correction authority',
    );
  }
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  const factHash = hashAccountingExternalSaleSettlementFact(input.fact);
  const accountPrerequisites = buildAccountPrerequisites(
    input.fact,
    input.accountFacts,
  );
  assertSettlementComponentComposition(input.fact, accountPrerequisites);
  const receivablePrerequisites = buildReceivablePrerequisites(
    input.fact,
    input.receivableSnapshots,
  );

  return {
    journal: buildJournalFromFact(input.fact, businessTimezone),
    authority: {
      version: 1,
      role: 'EXTERNAL_SALE_SETTLEMENT',
      businessTimezone,
      fact: input.fact,
      factHash,
      accountPrerequisites,
      receivablePrerequisites,
    },
  };
};

export const normalizeExternalSaleSettlementWriteAuthority = (
  authority: ExternalSaleSettlementJournalWriteAuthorityV1,
): ExternalSaleSettlementJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'EXTERNAL_SALE_SETTLEMENT'
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement authority must be EXTERNAL_SALE_SETTLEMENT v1',
    );
  }
  const businessTimezone = normalizeTimezone(authority.businessTimezone);
  const factHash = hashAccountingExternalSaleSettlementFact(authority.fact);
  if (factHash !== authority.factHash) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement authority factHash does not match the frozen fact',
    );
  }

  const accountPrerequisites = buildAccountPrerequisites(
    authority.fact,
    authority.accountPrerequisites.map((item) => ({
      accountStableId: item.accountStableId,
      accountClass: item.actual.accountClass,
      accountType: item.actual.accountType,
      currency: item.actual.currency,
      isActive: item.actual.isActive,
    })),
  );
  assertSettlementComponentComposition(authority.fact, accountPrerequisites);

  return {
    version: 1,
    role: 'EXTERNAL_SALE_SETTLEMENT',
    businessTimezone,
    fact: authority.fact,
    factHash,
    accountPrerequisites,
    receivablePrerequisites: buildReceivablePrerequisites(
      authority.fact,
      authority.receivablePrerequisites.map((item) => ({
        externalSaleStableId: item.externalSaleStableId,
        saleOccurredOn: item.saleOccurredOn,
        storeStableId: item.storeStableId,
        counterpartyName: item.counterpartyName,
        currency: item.currency,
        saleFactHash: item.saleFactHash,
        saleJournalEntryStableId: item.saleJournalEntryStableId,
        totalReceivableCents: item.totalReceivableCents,
        settledBeforeCents: item.settledBeforeCents,
        outstandingBeforeCents: item.outstandingBeforeCents,
      })),
    ),
  };
};

export const assertExternalSaleSettlementJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: ExternalSaleSettlementJournalWriteAuthorityV1,
): void => {
  const authority = normalizeExternalSaleSettlementWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildJournalFromFact(authority.fact, authority.businessTimezone),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement Journal does not match its frozen settlement authority',
    );
  }
};

export const hashExternalSaleSettlementJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: ExternalSaleSettlementJournalWriteAuthorityV1,
): string => {
  const authority = normalizeExternalSaleSettlementWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
