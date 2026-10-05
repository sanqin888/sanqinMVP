import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_VERSION,
  type AccountingOpeningReceivableFactV1,
} from './accounting-opening-receivable.contract';
import { hashAccountingOpeningReceivableFact } from './accounting-opening-receivable.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type AccountingOpeningReceivableAccountFactV1 = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type AccountingOpeningReceivableAccountPrerequisiteV1 = {
  accountStableId: string;
  expectedAccountClass: 'ASSET' | 'EQUITY';
  actual: AccountingOpeningReceivableAccountFactV1;
};

export type AccountingOpeningReceivableJournalWriteAuthorityV1 = {
  version: 1;
  role: 'OPENING_RECEIVABLE_RECOGNITION';
  businessTimezone: string;
  fact: AccountingOpeningReceivableFactV1;
  factHash: string;
  accountPrerequisites: AccountingOpeningReceivableAccountPrerequisiteV1[];
};

const normalizeTimezone = (raw: string): string => {
  const timezone = raw?.trim();
  if (!timezone || !DateTime.now().setZone(timezone).isValid) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable businessTimezone is invalid',
    );
  }
  return timezone;
};

const occurredAt = (openingDate: string, timezone: string): string => {
  const local = DateTime.fromISO(openingDate, { zone: timezone }).startOf('day');
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable openingDate/businessTimezone could not be resolved',
    );
  }
  return iso;
};

const accountPrerequisites = (
  accountFacts: AccountingOpeningReceivableAccountFactV1[],
): AccountingOpeningReceivableAccountPrerequisiteV1[] => {
  const expected = new Map<string, 'ASSET' | 'EQUITY'>([
    [ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID, 'ASSET'],
    [ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID, 'EQUITY'],
  ]);
  const byStableId = new Map(
    accountFacts.map((account) => [account.accountStableId, account] as const),
  );
  if (
    byStableId.size !== expected.size ||
    accountFacts.length !== expected.size
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable account facts must exactly match required accounts',
    );
  }

  return [...expected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([accountStableId, accountClass]) => {
      const actual = byStableId.get(accountStableId);
      if (
        !actual ||
        actual.accountClass !== accountClass ||
        actual.accountType !== null ||
        actual.currency !== 'CAD' ||
        actual.isActive !== true
      ) {
        throw new AccountingJournalPolicyError(
          `Opening Receivable account is not an active CAD ${accountClass} account with no operational type: ${accountStableId}`,
        );
      }
      return {
        accountStableId,
        expectedAccountClass: accountClass,
        actual,
      };
    });
};

const buildJournalFromFact = (
  fact: AccountingOpeningReceivableFactV1,
  businessTimezone: string,
): AccountingJournalCreateInput => ({
  idempotencyKey: `opening-receivable:${fact.openingReceivableStableId}:v1`,
  kind: AccountingJournalEntryKind.OPENING_BALANCE,
  source: AccountingJournalSource.MANUAL,
  sourceFactType: ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
  sourceFactStableId: fact.openingReceivableStableId,
  sourceFactVersion: ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_VERSION,
  storeStableId: fact.storeStableId,
  occurredAt: occurredAt(fact.openingDate, businessTimezone),
  currency: 'CAD',
  memo: `Opening receivable — ${fact.counterpartyName}`,
  lines: [
    {
      accountStableId: ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
      debitCents: fact.amountCents,
      creditCents: 0,
      memo: 'Opening accounts receivable',
    },
    {
      accountStableId: ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
      debitCents: 0,
      creditCents: fact.amountCents,
      memo: 'Opening balance equity',
    },
  ],
});

export const buildAccountingOpeningReceivableWritePlan = (input: {
  fact: AccountingOpeningReceivableFactV1;
  businessTimezone: string;
  accountFacts: AccountingOpeningReceivableAccountFactV1[];
}) => {
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  const factHash = hashAccountingOpeningReceivableFact(input.fact);
  return {
    journal: buildJournalFromFact(input.fact, businessTimezone),
    authority: {
      version: 1,
      role: 'OPENING_RECEIVABLE_RECOGNITION',
      businessTimezone,
      fact: input.fact,
      factHash,
      accountPrerequisites: accountPrerequisites(input.accountFacts),
    } satisfies AccountingOpeningReceivableJournalWriteAuthorityV1,
  };
};

export const normalizeAccountingOpeningReceivableWriteAuthority = (
  authority: AccountingOpeningReceivableJournalWriteAuthorityV1,
): AccountingOpeningReceivableJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'OPENING_RECEIVABLE_RECOGNITION'
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable authority must be OPENING_RECEIVABLE_RECOGNITION v1',
    );
  }
  const businessTimezone = normalizeTimezone(authority.businessTimezone);
  const factHash = hashAccountingOpeningReceivableFact(authority.fact);
  if (authority.factHash !== factHash) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable authority factHash does not match the frozen fact',
    );
  }
  return {
    version: 1,
    role: 'OPENING_RECEIVABLE_RECOGNITION',
    businessTimezone,
    fact: authority.fact,
    factHash,
    accountPrerequisites: accountPrerequisites(
      authority.accountPrerequisites.map(({ actual }) => actual),
    ),
  };
};

export const assertAccountingOpeningReceivableJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeAccountingOpeningReceivableWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildJournalFromFact(authority.fact, authority.businessTimezone),
  );
  if (hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable Journal does not match its frozen source-fact authority',
    );
  }
};

export const hashAccountingOpeningReceivableJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeAccountingOpeningReceivableWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
