import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
} from './accounting-opening-receivable.contract';
import {
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_VERSION,
  type AccountingOpeningReceivableSettlementFactV1,
} from './accounting-opening-receivable-settlement.contract';
import { hashAccountingOpeningReceivableSettlementFact } from './accounting-opening-receivable-settlement.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type AccountingOpeningReceivableSettlementAccountFactV1 = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type AccountingOpeningReceivableSettlementAccountPrerequisiteV1 = {
  role: 'ACCOUNTS_RECEIVABLE' | 'COLLECTION_ASSET';
  accountStableId: string;
  expectedAccountClass: 'ASSET';
  expectedAccountType: null | 'BANK' | 'CASH';
  actual: AccountingOpeningReceivableSettlementAccountFactV1;
};

export type AccountingOpeningReceivableSettlementReceivableSnapshotV1 = {
  openingReceivableStableId: string;
  openingDate: string;
  accountingStartDate: string;
  storeStableId: string;
  counterpartyName: string;
  currency: 'CAD';
  openingFactHash: string;
  openingJournalEntryStableId: string;
  openingAmountCents: number;
  settledBeforeCents: number;
  outstandingBeforeCents: number;
};

export type AccountingOpeningReceivableSettlementJournalWriteAuthorityV1 = {
  version: 1;
  role: 'OPENING_RECEIVABLE_SETTLEMENT';
  businessTimezone: string;
  fact: AccountingOpeningReceivableSettlementFactV1;
  factHash: string;
  accountPrerequisites: AccountingOpeningReceivableSettlementAccountPrerequisiteV1[];
  receivablePrerequisite: AccountingOpeningReceivableSettlementReceivableSnapshotV1;
};

const normalizeTimezone = (raw: string): string => {
  const timezone = raw?.trim();
  if (!timezone || !DateTime.now().setZone(timezone).isValid) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement businessTimezone is invalid',
    );
  }
  return timezone;
};

const settlementOccurredAt = (
  settlementOn: string,
  timezone: string,
): string => {
  const local = DateTime.fromISO(settlementOn, { zone: timezone }).startOf(
    'day',
  );
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement date/businessTimezone could not be resolved',
    );
  }
  return iso;
};

const requirePositiveMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
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

const buildAccountPrerequisites = (
  fact: AccountingOpeningReceivableSettlementFactV1,
  accountFacts: AccountingOpeningReceivableSettlementAccountFactV1[],
): AccountingOpeningReceivableSettlementAccountPrerequisiteV1[] => {
  if (
    fact.collectionAccountStableId ===
    ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement collection account cannot be Accounts Receivable',
    );
  }

  const required = [
    ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
    fact.collectionAccountStableId,
  ].sort();
  const byStableId = new Map(
    accountFacts.map((account) => [account.accountStableId, account] as const),
  );
  if (
    byStableId.size !== accountFacts.length ||
    byStableId.size !== required.length
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement account facts must exactly match required accounts',
    );
  }

  return required.map((accountStableId) => {
    const actual = byStableId.get(accountStableId);
    if (!actual) {
      throw new AccountingJournalPolicyError(
        `Opening Receivable settlement account is not provisioned: ${accountStableId}`,
      );
    }
    if (
      actual.currency !== 'CAD' ||
      actual.isActive !== true ||
      actual.accountClass !== AccountingAccountClass.ASSET
    ) {
      throw new AccountingJournalPolicyError(
        `Opening Receivable settlement account must be an active CAD ASSET account: ${accountStableId}`,
      );
    }

    if (
      accountStableId === ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID
    ) {
      if (actual.accountType !== null) {
        throw new AccountingJournalPolicyError(
          'Opening Receivable Accounts Receivable must have no operational account type',
        );
      }
      return {
        role: 'ACCOUNTS_RECEIVABLE' as const,
        accountStableId,
        expectedAccountClass: 'ASSET' as const,
        expectedAccountType: null,
        actual,
      };
    }

    if (
      actual.accountType !== AccountingAccountType.BANK &&
      actual.accountType !== AccountingAccountType.CASH
    ) {
      throw new AccountingJournalPolicyError(
        'Opening Receivable settlement collection account must be BANK or CASH',
      );
    }
    return {
      role: 'COLLECTION_ASSET' as const,
      accountStableId,
      expectedAccountClass: 'ASSET' as const,
      expectedAccountType: actual.accountType,
      actual,
    };
  });
};

const normalizeReceivablePrerequisite = (
  fact: AccountingOpeningReceivableSettlementFactV1,
  snapshot: AccountingOpeningReceivableSettlementReceivableSnapshotV1,
): AccountingOpeningReceivableSettlementReceivableSnapshotV1 => {
  const openingAmountCents = requirePositiveMoney(
    snapshot.openingAmountCents,
    'openingAmountCents',
  );
  const settledBeforeCents = requireNonNegativeMoney(
    snapshot.settledBeforeCents,
    'settledBeforeCents',
  );
  const outstandingBeforeCents = requireNonNegativeMoney(
    snapshot.outstandingBeforeCents,
    'outstandingBeforeCents',
  );
  if (settledBeforeCents + outstandingBeforeCents !== openingAmountCents) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement receivable snapshot does not reconcile',
    );
  }
  if (fact.amountCents > outstandingBeforeCents) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement exceeds outstanding receivable',
    );
  }
  if (
    snapshot.openingReceivableStableId !== fact.openingReceivableStableId ||
    snapshot.storeStableId !== fact.storeStableId ||
    snapshot.counterpartyName !== fact.counterpartyName ||
    snapshot.currency !== 'CAD'
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement target does not match Store/counterparty/currency authority',
    );
  }
  if (
    fact.settlementOn < snapshot.openingDate ||
    fact.settlementOn < snapshot.accountingStartDate
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement date cannot precede the opening/cutover date',
    );
  }
  if (!snapshot.openingFactHash.trim()) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement requires the opening fact hash',
    );
  }
  if (!snapshot.openingJournalEntryStableId.trim()) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement requires the opening Journal anchor',
    );
  }

  return {
    ...snapshot,
    openingAmountCents,
    settledBeforeCents,
    outstandingBeforeCents,
  };
};

const buildJournalFromFact = (
  fact: AccountingOpeningReceivableSettlementFactV1,
  businessTimezone: string,
): AccountingJournalCreateInput => ({
  idempotencyKey: `opening-receivable-settlement:${fact.settlementStableId}:v1`,
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.MANUAL,
  sourceFactType: ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE,
  sourceFactStableId: fact.settlementStableId,
  sourceFactVersion:
    ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_VERSION,
  storeStableId: fact.storeStableId,
  occurredAt: settlementOccurredAt(fact.settlementOn, businessTimezone),
  currency: 'CAD',
  memo: `Opening receivable settlement — ${fact.counterpartyName}`,
  lines: [
    {
      accountStableId: fact.collectionAccountStableId,
      debitCents: fact.amountCents,
      creditCents: 0,
      memo: 'Opening receivable collection',
    },
    {
      accountStableId: ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
      debitCents: 0,
      creditCents: fact.amountCents,
      memo: 'Clear opening accounts receivable',
    },
  ],
});

export const calculateOpeningReceivableCanonicalAmountCents = (
  lines: Array<{
    accountStableId: string;
    debitCents: number;
    creditCents: number;
  }>,
): number => {
  if (lines.length !== 2) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable canonical Journal must contain exactly two lines',
    );
  }
  const ar = lines.filter(
    (line) =>
      line.accountStableId ===
      ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
  );
  const equity = lines.filter(
    (line) =>
      line.accountStableId ===
      ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
  );
  if (ar.length !== 1 || equity.length !== 1) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable canonical Journal must contain exactly one AR and one Opening Balance Equity line',
    );
  }
  const arLine = ar[0];
  const equityLine = equity[0];
  if (
    !arLine ||
    !equityLine ||
    !Number.isSafeInteger(arLine.debitCents) ||
    !Number.isSafeInteger(arLine.creditCents) ||
    !Number.isSafeInteger(equityLine.debitCents) ||
    !Number.isSafeInteger(equityLine.creditCents) ||
    arLine.debitCents <= 0 ||
    arLine.creditCents !== 0 ||
    equityLine.debitCents !== 0 ||
    equityLine.creditCents !== arLine.debitCents
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable canonical Journal has an invalid AR / Opening Balance Equity shape',
    );
  }
  return arLine.debitCents;
};

export const calculateOpeningReceivableSettlementAppliedCents = (
  lines: Array<{
    accountStableId: string;
    debitCents: number;
    creditCents: number;
  }>,
  collectionAccountStableId: string,
): number => {
  if (
    !collectionAccountStableId ||
    collectionAccountStableId ===
      ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID ||
    lines.length !== 2
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement canonical Journal has an invalid account shape',
    );
  }
  const collection = lines.filter(
    (line) => line.accountStableId === collectionAccountStableId,
  );
  const ar = lines.filter(
    (line) =>
      line.accountStableId ===
      ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
  );
  if (collection.length !== 1 || ar.length !== 1) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement canonical Journal must contain exactly one collection line and one AR line',
    );
  }
  const collectionLine = collection[0];
  const arLine = ar[0];
  if (
    !collectionLine ||
    !arLine ||
    !Number.isSafeInteger(collectionLine.debitCents) ||
    !Number.isSafeInteger(collectionLine.creditCents) ||
    !Number.isSafeInteger(arLine.debitCents) ||
    !Number.isSafeInteger(arLine.creditCents) ||
    collectionLine.debitCents <= 0 ||
    collectionLine.creditCents !== 0 ||
    arLine.debitCents !== 0 ||
    arLine.creditCents !== collectionLine.debitCents
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement canonical Journal has an invalid BANK/CASH -> AR shape',
    );
  }
  return arLine.creditCents;
};

export const buildAccountingOpeningReceivableSettlementWritePlan = (input: {
  fact: AccountingOpeningReceivableSettlementFactV1;
  businessTimezone: string;
  accountFacts: AccountingOpeningReceivableSettlementAccountFactV1[];
  receivableSnapshot: AccountingOpeningReceivableSettlementReceivableSnapshotV1;
}) => {
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  const factHash = hashAccountingOpeningReceivableSettlementFact(input.fact);
  return {
    journal: buildJournalFromFact(input.fact, businessTimezone),
    authority: {
      version: 1,
      role: 'OPENING_RECEIVABLE_SETTLEMENT',
      businessTimezone,
      fact: input.fact,
      factHash,
      accountPrerequisites: buildAccountPrerequisites(
        input.fact,
        input.accountFacts,
      ),
      receivablePrerequisite: normalizeReceivablePrerequisite(
        input.fact,
        input.receivableSnapshot,
      ),
    } satisfies AccountingOpeningReceivableSettlementJournalWriteAuthorityV1,
  };
};

export const normalizeAccountingOpeningReceivableSettlementWriteAuthority = (
  authority: AccountingOpeningReceivableSettlementJournalWriteAuthorityV1,
): AccountingOpeningReceivableSettlementJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'OPENING_RECEIVABLE_SETTLEMENT'
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement authority must be OPENING_RECEIVABLE_SETTLEMENT v1',
    );
  }
  const businessTimezone = normalizeTimezone(authority.businessTimezone);
  const factHash = hashAccountingOpeningReceivableSettlementFact(
    authority.fact,
  );
  if (factHash !== authority.factHash) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement authority factHash does not match the frozen fact',
    );
  }
  return {
    version: 1,
    role: 'OPENING_RECEIVABLE_SETTLEMENT',
    businessTimezone,
    fact: authority.fact,
    factHash,
    accountPrerequisites: buildAccountPrerequisites(
      authority.fact,
      authority.accountPrerequisites.map(({ actual }) => actual),
    ),
    receivablePrerequisite: normalizeReceivablePrerequisite(
      authority.fact,
      authority.receivablePrerequisite,
    ),
  };
};

export const assertAccountingOpeningReceivableSettlementJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableSettlementJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeAccountingOpeningReceivableSettlementWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildJournalFromFact(authority.fact, authority.businessTimezone),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable settlement Journal does not match its frozen source-fact authority',
    );
  }
};

export const hashAccountingOpeningReceivableSettlementJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableSettlementJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeAccountingOpeningReceivableSettlementWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
