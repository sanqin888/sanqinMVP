import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';
import { CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID } from './accounting-provider-fee-clearing.contract';

export const PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE =
  'accounting.provider_fee_bank_withdrawal.v1';
export const PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_VERSION = 1;

export type ProviderFeeBankWithdrawalFactV1 = {
  decisionStableId: string;
  provider: typeof AccountingFinancialProvider.CLOVER;
  storeStableId: string;
  withdrawalDate: string;
  bankAccountStableId: string;
  amountCents: number;
  currency: 'CAD';
};

export type ProviderFeeBankWithdrawalAccountFact = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type ProviderFeeBankWithdrawalJournalWriteAuthorityV1 = {
  version: 1;
  role: 'PROVIDER_FEE_BANK_WITHDRAWAL';
  businessTimezone: string;
  fact: ProviderFeeBankWithdrawalFactV1;
  accountPrerequisites: ProviderFeeBankWithdrawalAccountFact[];
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
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

const normalizeTimezone = (raw: string): string => {
  const timezone = requireValue(raw, 'businessTimezone');
  if (!DateTime.now().setZone(timezone).isValid) {
    throw new AccountingJournalPolicyError(
      `businessTimezone is invalid: ${timezone}`,
    );
  }
  return timezone;
};

export const normalizeProviderFeeBankWithdrawalFact = (
  fact: ProviderFeeBankWithdrawalFactV1,
): ProviderFeeBankWithdrawalFactV1 => {
  if (fact.provider !== AccountingFinancialProvider.CLOVER) {
    throw new AccountingJournalPolicyError(
      'Provider fee bank withdrawal currently supports Clover only',
    );
  }
  if (fact.currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'Provider fee bank withdrawal currently requires CAD currency',
    );
  }
  return {
    decisionStableId: requireValue(fact.decisionStableId, 'decisionStableId'),
    provider: AccountingFinancialProvider.CLOVER,
    storeStableId: requireValue(fact.storeStableId, 'storeStableId'),
    withdrawalDate: requireDateOnly(fact.withdrawalDate, 'withdrawalDate'),
    bankAccountStableId: requireValue(
      fact.bankAccountStableId,
      'bankAccountStableId',
    ),
    amountCents: requirePositiveMoney(fact.amountCents, 'amountCents'),
    currency: 'CAD',
  };
};

const withdrawalOccurredAt = (
  withdrawalDate: string,
  businessTimezone: string,
): string => {
  const local = DateTime.fromISO(withdrawalDate, {
    zone: normalizeTimezone(businessTimezone),
  }).startOf('day');
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'withdrawalDate/businessTimezone could not be resolved',
    );
  }
  return iso;
};

export function buildProviderFeeBankWithdrawalWritePlan(input: {
  fact: ProviderFeeBankWithdrawalFactV1;
  businessTimezone: string;
  accountFacts: ProviderFeeBankWithdrawalAccountFact[];
}) {
  const fact = normalizeProviderFeeBankWithdrawalFact(input.fact);
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  const byId = new Map(
    input.accountFacts.map((account) => [account.accountStableId, account]),
  );
  const payable = byId.get(CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID);
  const bank = byId.get(fact.bankAccountStableId);
  if (
    !payable ||
    payable.accountClass !== AccountingAccountClass.LIABILITY ||
    payable.accountType !== null ||
    payable.currency !== 'CAD' ||
    !payable.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Clover fee payable must be an active CAD liability account with no account type',
    );
  }
  if (
    !bank ||
    bank.accountClass !== AccountingAccountClass.ASSET ||
    bank.accountType !== AccountingAccountType.BANK ||
    bank.currency !== 'CAD' ||
    !bank.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Provider fee withdrawal bank must be an active CAD BANK asset account',
    );
  }

  const journal: AccountingJournalCreateInput = {
    idempotencyKey: `provider-fee-bank-withdrawal:${fact.decisionStableId}:v1`,
    kind: AccountingJournalEntryKind.TRANSFER,
    source: AccountingJournalSource.PAYMENT,
    sourceFactType: PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.decisionStableId,
    sourceFactVersion: PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: withdrawalOccurredAt(fact.withdrawalDate, businessTimezone),
    currency: 'CAD',
    memo: `Clover fee bank withdrawal ${fact.decisionStableId}`,
    lines: [
      {
        accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
        debitCents: fact.amountCents,
        memo: 'Clear Clover fee payable',
      },
      {
        accountStableId: fact.bankAccountStableId,
        creditCents: fact.amountCents,
        memo: 'Clover fee withdrawn from bank',
      },
    ],
  };

  return {
    journal,
    authority: {
      version: 1 as const,
      role: 'PROVIDER_FEE_BANK_WITHDRAWAL' as const,
      businessTimezone,
      fact,
      accountPrerequisites: [payable, bank].sort((left, right) =>
        left.accountStableId.localeCompare(right.accountStableId),
      ),
    },
  };
}

export const normalizeProviderFeeBankWithdrawalWriteAuthority = (
  authority: ProviderFeeBankWithdrawalJournalWriteAuthorityV1,
): ProviderFeeBankWithdrawalJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'PROVIDER_FEE_BANK_WITHDRAWAL'
  ) {
    throw new AccountingJournalPolicyError(
      'provider fee bank withdrawal authority is invalid',
    );
  }
  return {
    ...authority,
    businessTimezone: normalizeTimezone(authority.businessTimezone),
    fact: normalizeProviderFeeBankWithdrawalFact(authority.fact),
  };
};

export const assertProviderFeeBankWithdrawalJournalAuthority = (
  journalRaw: NormalizedJournalCreate,
  authorityRaw: ProviderFeeBankWithdrawalJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeProviderFeeBankWithdrawalWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildProviderFeeBankWithdrawalWritePlan({
      fact: authority.fact,
      businessTimezone: authority.businessTimezone,
      accountFacts: authority.accountPrerequisites,
    }).journal,
  );
  if (
    hashJournalCreatePayload(journalRaw) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'provider fee bank withdrawal Journal does not match write authority',
    );
  }
};

export const hashProviderFeeBankWithdrawalJournalWrite = (
  journal: NormalizedJournalCreate,
  authority: ProviderFeeBankWithdrawalJournalWriteAuthorityV1,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        journalHash: hashJournalCreatePayload(journal),
        writeAuthority: normalizeProviderFeeBankWithdrawalWriteAuthority(
          authority,
        ),
      }),
    )
    .digest('hex');
