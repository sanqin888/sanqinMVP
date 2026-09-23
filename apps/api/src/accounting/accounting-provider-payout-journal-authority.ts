import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  type AccountingAccountClass as AccountingAccountClassValue,
  type AccountingAccountType as AccountingAccountTypeValue,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';
import { providerPendingAccountStableId } from './accounting-provider-accounts';

export const PROVIDER_PAYOUT_SOURCE_FACT_TYPE = 'accounting.provider_payout.v1';
export const PROVIDER_PAYOUT_SOURCE_FACT_VERSION = 1;

export type ProviderPayoutAccountFact = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type ProviderPayoutFactV1 = {
  payoutStableId: string;
  provider: AccountingFinancialProviderValue;
  storeStableId: string;
  payoutDate: string;
  destinationBankAccountStableId: string;
  amountCents: number;
  currency: string;
  providerReference: string | null;
};

export type ProviderPayoutAccountPrerequisiteV1 = {
  role: 'PROVIDER_PENDING' | 'DESTINATION_BANK';
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

export type ProviderPayoutJournalWriteAuthorityV1 = {
  version: 1;
  role: 'PROVIDER_PAYOUT';
  businessTimezone: string;
  fact: ProviderPayoutFactV1;
  accountPrerequisites: ProviderPayoutAccountPrerequisiteV1[];
};

export type ProviderPayoutWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: ProviderPayoutJournalWriteAuthorityV1;
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const optionalValue = (raw: string | null, field: string): string | null => {
  if (raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 200) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed 200 characters`,
    );
  }
  return value;
};

const requireDateOnly = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !parsed.isValid ||
    parsed.toISODate() !== value
  ) {
    throw new AccountingJournalPolicyError(
      `${field} must be a valid ISO date-only value`,
    );
  }
  return value;
};

const requireProvider = (
  provider: AccountingFinancialProviderValue,
): AccountingFinancialProviderValue => {
  if (
    provider !== AccountingFinancialProvider.CLOVER &&
    provider !== AccountingFinancialProvider.UBER_EATS &&
    provider !== AccountingFinancialProvider.FANTUAN
  ) {
    throw new AccountingJournalPolicyError(
      `Unsupported provider payout provider: ${String(provider)}`,
    );
  }
  return provider;
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
  const probe = DateTime.now().setZone(timezone);
  if (!probe.isValid) {
    throw new AccountingJournalPolicyError(
      `businessTimezone is invalid: ${timezone}`,
    );
  }
  return timezone;
};

const payoutOccurredAt = (
  payoutDate: string,
  businessTimezone: string,
): string => {
  const local = DateTime.fromISO(payoutDate, {
    zone: businessTimezone,
  }).startOf('day');
  if (!local.isValid) {
    throw new AccountingJournalPolicyError(
      'payoutDate/businessTimezone could not be resolved',
    );
  }
  const iso = local.toUTC().toISO();
  if (!iso) {
    throw new AccountingJournalPolicyError(
      'payoutDate/businessTimezone could not be serialized',
    );
  }
  return iso;
};

export const normalizeProviderPayoutFact = (
  fact: ProviderPayoutFactV1,
): ProviderPayoutFactV1 => {
  const currency = requireValue(fact.currency, 'currency').toUpperCase();
  if (currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'Provider payout currently requires CAD currency',
    );
  }

  return {
    payoutStableId: requireValue(fact.payoutStableId, 'payoutStableId'),
    provider: requireProvider(fact.provider),
    storeStableId: requireValue(fact.storeStableId, 'storeStableId'),
    payoutDate: requireDateOnly(fact.payoutDate, 'payoutDate'),
    destinationBankAccountStableId: requireValue(
      fact.destinationBankAccountStableId,
      'destinationBankAccountStableId',
    ),
    amountCents: requirePositiveMoney(fact.amountCents, 'amountCents'),
    currency,
    providerReference: optionalValue(
      fact.providerReference,
      'providerReference',
    ),
  };
};

const findAccount = (
  accountFacts: ProviderPayoutAccountFact[],
  accountStableId: string,
): ProviderPayoutAccountFact => {
  const account = accountFacts.find(
    (candidate) => candidate.accountStableId === accountStableId,
  );
  if (!account) {
    throw new AccountingJournalPolicyError(
      `Provider payout account is not provisioned: ${accountStableId}`,
    );
  }
  return account;
};

export const buildProviderPayoutAccountPrerequisites = (
  factRaw: ProviderPayoutFactV1,
  accountFacts: ProviderPayoutAccountFact[],
): ProviderPayoutAccountPrerequisiteV1[] => {
  const fact = normalizeProviderPayoutFact(factRaw);
  const pendingAccountStableId = providerPendingAccountStableId(fact.provider);
  const pending = findAccount(accountFacts, pendingAccountStableId);
  if (
    pending.accountClass !== AccountingAccountClass.ASSET ||
    pending.accountType !== AccountingAccountType.PLATFORM_WALLET ||
    pending.currency !== 'CAD' ||
    !pending.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Provider payout pending account must be an active CAD PLATFORM_WALLET asset account',
    );
  }

  const destination = findAccount(
    accountFacts,
    fact.destinationBankAccountStableId,
  );
  if (
    destination.accountClass !== AccountingAccountClass.ASSET ||
    destination.accountType !== AccountingAccountType.BANK ||
    destination.currency !== 'CAD' ||
    !destination.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Provider payout destination must be an active CAD BANK asset account',
    );
  }

  return [
    {
      role: 'PROVIDER_PENDING',
      accountStableId: pending.accountStableId,
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        accountType: AccountingAccountType.PLATFORM_WALLET,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: pending.accountClass,
        accountType: pending.accountType,
        currency: pending.currency,
        isActive: pending.isActive,
      },
    },
    {
      role: 'DESTINATION_BANK',
      accountStableId: destination.accountStableId,
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        accountType: AccountingAccountType.BANK,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: destination.accountClass,
        accountType: destination.accountType,
        currency: destination.currency,
        isActive: destination.isActive,
      },
    },
  ];
};

const buildProviderPayoutJournalFromFact = (
  factRaw: ProviderPayoutFactV1,
  businessTimezoneRaw: string,
): AccountingJournalCreateInput => {
  const fact = normalizeProviderPayoutFact(factRaw);
  const businessTimezone = normalizeTimezone(businessTimezoneRaw);
  const pendingAccountStableId = providerPendingAccountStableId(fact.provider);
  const memo = fact.providerReference
    ? `${fact.provider} payout ${fact.providerReference}`
    : `${fact.provider} payout ${fact.payoutStableId}`;

  return {
    idempotencyKey: `provider-payout:${fact.payoutStableId}:v1`,
    kind: AccountingJournalEntryKind.TRANSFER,
    source: AccountingJournalSource.PAYMENT,
    sourceFactType: PROVIDER_PAYOUT_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.payoutStableId,
    sourceFactVersion: PROVIDER_PAYOUT_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: payoutOccurredAt(fact.payoutDate, businessTimezone),
    currency: 'CAD',
    memo,
    lines: [
      {
        accountStableId: fact.destinationBankAccountStableId,
        debitCents: fact.amountCents,
        memo: `${fact.provider} payout received`,
      },
      {
        accountStableId: pendingAccountStableId,
        creditCents: fact.amountCents,
        memo: `Clear ${fact.provider} pending balance`,
      },
    ],
  };
};

export const buildProviderPayoutWritePlan = (input: {
  fact: ProviderPayoutFactV1;
  businessTimezone: string;
  accountFacts: ProviderPayoutAccountFact[];
}): ProviderPayoutWritePlanV1 => {
  const fact = normalizeProviderPayoutFact(input.fact);
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  return {
    journal: buildProviderPayoutJournalFromFact(fact, businessTimezone),
    authority: {
      version: 1,
      role: 'PROVIDER_PAYOUT',
      businessTimezone,
      fact,
      accountPrerequisites: buildProviderPayoutAccountPrerequisites(
        fact,
        input.accountFacts,
      ),
    },
  };
};

export const normalizeProviderPayoutWriteAuthority = (
  authority: ProviderPayoutJournalWriteAuthorityV1,
): ProviderPayoutJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'PROVIDER_PAYOUT') {
    throw new AccountingJournalPolicyError(
      'Provider payout authority must be PROVIDER_PAYOUT v1',
    );
  }
  const fact = normalizeProviderPayoutFact(authority.fact);
  const businessTimezone = normalizeTimezone(authority.businessTimezone);
  const accountPrerequisites = buildProviderPayoutAccountPrerequisites(
    fact,
    authority.accountPrerequisites.map((item) => ({
      accountStableId: item.accountStableId,
      accountClass: item.actual.accountClass,
      accountType: item.actual.accountType,
      currency: item.actual.currency,
      isActive: item.actual.isActive,
    })),
  );
  return {
    version: 1,
    role: 'PROVIDER_PAYOUT',
    businessTimezone,
    fact,
    accountPrerequisites,
  };
};

export const assertProviderPayoutJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: ProviderPayoutJournalWriteAuthorityV1,
): void => {
  const authority = normalizeProviderPayoutWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildProviderPayoutJournalFromFact(
      authority.fact,
      authority.businessTimezone,
    ),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Provider payout Journal does not match its frozen payout authority',
    );
  }
};

export const hashProviderPayoutJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: ProviderPayoutJournalWriteAuthorityV1,
): string => {
  const authority = normalizeProviderPayoutWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
