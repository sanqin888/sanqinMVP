import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_VERSION,
  type AccountingExternalSaleFactV1,
} from './accounting-external-sales.contract';
import {
  buildAccountingExternalSalePostingDraft,
  hashAccountingExternalSaleFact,
} from './accounting-external-sales.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

const SALE_LINE_REVENUE_ACCOUNTS = new Set([
  'account_sales_revenue',
  'account_other_operating_revenue',
]);

const POSITIVE_ADJUSTMENT_REVENUE_ACCOUNTS = new Set([
  'account_delivery_revenue',
  'account_other_operating_revenue',
]);

const NEGATIVE_ADJUSTMENT_REVENUE_ACCOUNTS = new Set([
  'account_sales_discounts',
]);

const EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID = 'account_hst_payable';
const EXTERNAL_SALE_TAX_CODES = new Set(['HST', 'ZERO_RATED']);

export type ExternalSaleAccountFactV1 = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type ExternalSaleAccountPrerequisiteV1 = {
  accountStableId: string;
  expected: {
    accountClass: string;
    accountType: null;
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

export type ExternalSaleJournalWriteAuthorityV1 = {
  version: 1;
  role: 'EXTERNAL_SALE_RECOGNITION';
  businessTimezone: string;
  fact: AccountingExternalSaleFactV1;
  factHash: string;
  accountPrerequisites: ExternalSaleAccountPrerequisiteV1[];
};

export type ExternalSaleWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: ExternalSaleJournalWriteAuthorityV1;
};

const normalizeTimezone = (raw: string): string => {
  const timezone = raw?.trim();
  if (!timezone || !DateTime.now().setZone(timezone).isValid) {
    throw new AccountingJournalPolicyError(
      'External Sale businessTimezone is invalid',
    );
  }
  return timezone;
};

const occurredAtForSale = (
  occurredOn: string,
  businessTimezone: string,
): string => {
  const local = DateTime.fromISO(occurredOn, {
    zone: businessTimezone,
  }).startOf('day');
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'External Sale occurredOn/businessTimezone could not be resolved',
    );
  }
  return iso;
};

const expectedAccounts = (
  fact: AccountingExternalSaleFactV1,
): Map<string, string> => {
  const expected = new Map<string, string>([
    [
      ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
      AccountingAccountClass.ASSET,
    ],
  ]);

  for (const line of fact.lines) {
    if (!SALE_LINE_REVENUE_ACCOUNTS.has(line.revenueAccountStableId)) {
      throw new AccountingJournalPolicyError(
        `External Sale line revenue account is not allowed: ${line.revenueAccountStableId}`,
      );
    }
    expected.set(line.revenueAccountStableId, AccountingAccountClass.REVENUE);
  }

  for (const adjustment of fact.adjustments) {
    const allowed =
      adjustment.amountCents > 0
        ? POSITIVE_ADJUSTMENT_REVENUE_ACCOUNTS
        : NEGATIVE_ADJUSTMENT_REVENUE_ACCOUNTS;
    if (!allowed.has(adjustment.revenueAccountStableId)) {
      throw new AccountingJournalPolicyError(
        `External Sale adjustment account is not allowed for its sign: ${adjustment.revenueAccountStableId}`,
      );
    }
    expected.set(
      adjustment.revenueAccountStableId,
      AccountingAccountClass.REVENUE,
    );
  }

  for (const tax of fact.taxes) {
    if (
      !EXTERNAL_SALE_TAX_CODES.has(tax.taxCode) ||
      tax.liabilityAccountStableId !== EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID
    ) {
      throw new AccountingJournalPolicyError(
        `External Sale tax mapping is not allowed: ${tax.taxCode} -> ${tax.liabilityAccountStableId}`,
      );
    }
    expected.set(
      tax.liabilityAccountStableId,
      AccountingAccountClass.LIABILITY,
    );
  }

  return expected;
};

const buildAccountPrerequisites = (
  fact: AccountingExternalSaleFactV1,
  accountFacts: ExternalSaleAccountFactV1[],
): ExternalSaleAccountPrerequisiteV1[] => {
  const expected = expectedAccounts(fact);
  const byStableId = new Map(
    accountFacts.map((account) => [account.accountStableId, account] as const),
  );
  if (
    byStableId.size !== accountFacts.length ||
    byStableId.size !== expected.size
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale account facts must exactly match required accounts',
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
          `External Sale account is not an active CAD ${accountClass} account with no operational type: ${accountStableId}`,
        );
      }
      return {
        accountStableId,
        expected: {
          accountClass,
          accountType: null,
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

const buildJournalFromFact = (
  fact: AccountingExternalSaleFactV1,
  businessTimezone: string,
): AccountingJournalCreateInput => {
  expectedAccounts(fact);
  const draft = buildAccountingExternalSalePostingDraft(fact);
  return {
    idempotencyKey: `external-sale:${fact.externalSaleStableId}:v1`,
    kind:
      fact.replacementForExternalSaleStableId !== null
        ? AccountingJournalEntryKind.ADJUSTMENT
        : AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.EXTERNAL_SALE,
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.externalSaleStableId,
    sourceFactVersion: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: occurredAtForSale(fact.occurredOn, businessTimezone),
    currency: 'CAD',
    memo: draft.memo,
    lines: draft.lines,
  };
};

export const buildExternalSaleWritePlan = (input: {
  fact: AccountingExternalSaleFactV1;
  businessTimezone: string;
  accountFacts: ExternalSaleAccountFactV1[];
}): ExternalSaleWritePlanV1 => {
  const businessTimezone = normalizeTimezone(input.businessTimezone);
  const factHash = hashAccountingExternalSaleFact(input.fact);
  return {
    journal: buildJournalFromFact(input.fact, businessTimezone),
    authority: {
      version: 1,
      role: 'EXTERNAL_SALE_RECOGNITION',
      businessTimezone,
      fact: input.fact,
      factHash,
      accountPrerequisites: buildAccountPrerequisites(
        input.fact,
        input.accountFacts,
      ),
    },
  };
};

export const normalizeExternalSaleWriteAuthority = (
  authority: ExternalSaleJournalWriteAuthorityV1,
): ExternalSaleJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'EXTERNAL_SALE_RECOGNITION'
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale authority must be EXTERNAL_SALE_RECOGNITION v1',
    );
  }
  const businessTimezone = normalizeTimezone(authority.businessTimezone);
  const factHash = hashAccountingExternalSaleFact(authority.fact);
  if (authority.factHash !== factHash) {
    throw new AccountingJournalPolicyError(
      'External Sale authority factHash does not match the frozen fact',
    );
  }
  return {
    version: 1,
    role: 'EXTERNAL_SALE_RECOGNITION',
    businessTimezone,
    fact: authority.fact,
    factHash,
    accountPrerequisites: buildAccountPrerequisites(
      authority.fact,
      authority.accountPrerequisites.map((item) => ({
        accountStableId: item.accountStableId,
        accountClass: item.actual.accountClass,
        accountType: item.actual.accountType,
        currency: item.actual.currency,
        isActive: item.actual.isActive,
      })),
    ),
  };
};

export const assertExternalSaleJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: ExternalSaleJournalWriteAuthorityV1,
): void => {
  const authority = normalizeExternalSaleWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildJournalFromFact(authority.fact, authority.businessTimezone),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale Journal does not match its frozen sale authority',
    );
  }
};

export const hashExternalSaleJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: ExternalSaleJournalWriteAuthorityV1,
): string => {
  const authority = normalizeExternalSaleWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
