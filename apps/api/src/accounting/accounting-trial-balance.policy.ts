import {
  AccountingAccountClass,
  type AccountingAccountType,
  AccountingJournalEntryKind,
} from './accounting-contracts';
import type {
  AccountingTrialBalanceAccountRowV1,
  AccountingTrialBalanceNormalSideV1,
  AccountingTrialBalanceTotalsV1,
} from './accounting-trial-balance.contract';

export type AccountingTrialBalanceJournalLineV1 = {
  entryStableId: string;
  kind: AccountingJournalEntryKind;
  occurredAt: Date;
  debitCents: number;
  creditCents: number;
  account: {
    accountStableId: string;
    accountName: string;
    accountClass: AccountingAccountClass;
    accountType: AccountingAccountType | null;
    currency: string;
    isActive: boolean;
  };
};

export type AccountingTrialBalanceProjectionV1 = {
  accounts: AccountingTrialBalanceAccountRowV1[];
  totals: AccountingTrialBalanceTotalsV1;
  openingBalanceJournal: {
    entryCount: number;
    debitCents: number;
    creditCents: number;
  };
};

type AccountAccumulator = AccountingTrialBalanceJournalLineV1['account'] & {
  openingDebitCents: number;
  openingCreditCents: number;
  periodDebitCents: number;
  periodCreditCents: number;
};

type EntryAccumulator = {
  debitCents: number;
  creditCents: number;
};

const ACCOUNT_CLASS_ORDER: readonly AccountingAccountClass[] = [
  AccountingAccountClass.ASSET,
  AccountingAccountClass.LIABILITY,
  AccountingAccountClass.EQUITY,
  AccountingAccountClass.REVENUE,
  AccountingAccountClass.EXPENSE,
];

const assertMinorUnits = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
};

const safeAdd = (left: number, right: number, field: string): number => {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} exceeds safe integer range`);
  }
  return value;
};

const toBalanceSides = (rawBalanceCents: number) => ({
  debitBalanceCents: Math.max(rawBalanceCents, 0),
  creditBalanceCents: Math.max(-rawBalanceCents, 0),
});

export function accountingTrialBalanceNormalSide(
  accountClass: AccountingAccountClass,
): AccountingTrialBalanceNormalSideV1 {
  return accountClass === AccountingAccountClass.ASSET ||
    accountClass === AccountingAccountClass.EXPENSE
    ? 'DEBIT'
    : 'CREDIT';
}

const toNormalAmount = (
  normalSide: AccountingTrialBalanceNormalSideV1,
  debitMinusCreditCents: number,
): number =>
  normalSide === 'DEBIT' ? debitMinusCreditCents : -debitMinusCreditCents;

export function projectAccountingTrialBalance(params: {
  currency: string;
  fromInclusive: Date;
  toExclusive: Date;
  lines: AccountingTrialBalanceJournalLineV1[];
}): AccountingTrialBalanceProjectionV1 {
  if (
    Number.isNaN(params.fromInclusive.getTime()) ||
    Number.isNaN(params.toExclusive.getTime()) ||
    params.fromInclusive.getTime() >= params.toExclusive.getTime()
  ) {
    throw new Error('Trial Balance range is invalid');
  }

  const currency = params.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Trial Balance currency must be a 3-letter code');
  }

  const accounts = new Map<string, AccountAccumulator>();
  const entryTotals = new Map<string, EntryAccumulator>();
  const openingEntryIds = new Set<string>();
  let openingJournalDebitCents = 0;
  let openingJournalCreditCents = 0;

  for (const line of params.lines) {
    assertMinorUnits(line.debitCents, 'debitCents');
    assertMinorUnits(line.creditCents, 'creditCents');
    if (line.debitCents > 0 && line.creditCents > 0) {
      throw new Error(
        `Trial Balance line cannot contain both debit and credit: ${line.entryStableId}`,
      );
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      throw new Error(
        `Trial Balance line must contain debit or credit: ${line.entryStableId}`,
      );
    }
    if (line.occurredAt.getTime() >= params.toExclusive.getTime()) {
      throw new Error(
        `Trial Balance line falls outside report end: ${line.entryStableId}`,
      );
    }
    if (line.account.currency !== currency) {
      throw new Error(
        `Trial Balance account currency mismatch: ${line.account.accountStableId}`,
      );
    }

    const entry = entryTotals.get(line.entryStableId) ?? {
      debitCents: 0,
      creditCents: 0,
    };
    entry.debitCents = safeAdd(
      entry.debitCents,
      line.debitCents,
      'Journal debit total',
    );
    entry.creditCents = safeAdd(
      entry.creditCents,
      line.creditCents,
      'Journal credit total',
    );
    entryTotals.set(line.entryStableId, entry);

    const account = accounts.get(line.account.accountStableId) ?? {
      ...line.account,
      openingDebitCents: 0,
      openingCreditCents: 0,
      periodDebitCents: 0,
      periodCreditCents: 0,
    };
    const sameAccountMetadata =
      account.accountName === line.account.accountName &&
      account.accountClass === line.account.accountClass &&
      account.accountType === line.account.accountType &&
      account.currency === line.account.currency &&
      account.isActive === line.account.isActive;
    if (!sameAccountMetadata) {
      throw new Error(
        `Trial Balance account metadata drift: ${line.account.accountStableId}`,
      );
    }

    const isExplicitOpening =
      line.kind === AccountingJournalEntryKind.OPENING_BALANCE;
    const isOpeningBucket =
      isExplicitOpening ||
      line.occurredAt.getTime() < params.fromInclusive.getTime();
    if (isOpeningBucket) {
      account.openingDebitCents = safeAdd(
        account.openingDebitCents,
        line.debitCents,
        'Opening debit total',
      );
      account.openingCreditCents = safeAdd(
        account.openingCreditCents,
        line.creditCents,
        'Opening credit total',
      );
    } else {
      account.periodDebitCents = safeAdd(
        account.periodDebitCents,
        line.debitCents,
        'Period debit total',
      );
      account.periodCreditCents = safeAdd(
        account.periodCreditCents,
        line.creditCents,
        'Period credit total',
      );
    }
    accounts.set(line.account.accountStableId, account);

    if (isExplicitOpening) {
      openingEntryIds.add(line.entryStableId);
      openingJournalDebitCents = safeAdd(
        openingJournalDebitCents,
        line.debitCents,
        'Opening Journal debit total',
      );
      openingJournalCreditCents = safeAdd(
        openingJournalCreditCents,
        line.creditCents,
        'Opening Journal credit total',
      );
    }
  }

  for (const [entryStableId, entry] of entryTotals) {
    if (entry.debitCents !== entry.creditCents) {
      throw new Error(
        `Unbalanced Journal entry in Trial Balance projection: ${entryStableId}`,
      );
    }
  }
  if (openingJournalDebitCents !== openingJournalCreditCents) {
    throw new Error('OPENING_BALANCE Journals are not balanced');
  }

  const rows = Array.from(accounts.values()).map((account) => {
    const normalSide = accountingTrialBalanceNormalSide(account.accountClass);
    const openingRawBalanceCents =
      account.openingDebitCents - account.openingCreditCents;
    const periodRawMovementCents =
      account.periodDebitCents - account.periodCreditCents;
    const closingRawBalanceCents =
      openingRawBalanceCents + periodRawMovementCents;
    const opening = toBalanceSides(openingRawBalanceCents);
    const closing = toBalanceSides(closingRawBalanceCents);

    return {
      accountStableId: account.accountStableId,
      accountName: account.accountName,
      accountClass: account.accountClass,
      accountType: account.accountType,
      currency: account.currency,
      isActive: account.isActive,
      normalSide,
      openingDebitBalanceCents: opening.debitBalanceCents,
      openingCreditBalanceCents: opening.creditBalanceCents,
      openingNormalBalanceCents: toNormalAmount(
        normalSide,
        openingRawBalanceCents,
      ),
      periodDebitCents: account.periodDebitCents,
      periodCreditCents: account.periodCreditCents,
      periodNormalMovementCents: toNormalAmount(
        normalSide,
        periodRawMovementCents,
      ),
      closingDebitBalanceCents: closing.debitBalanceCents,
      closingCreditBalanceCents: closing.creditBalanceCents,
      closingNormalBalanceCents: toNormalAmount(
        normalSide,
        closingRawBalanceCents,
      ),
    };
  });

  rows.sort((left, right) => {
    const classDiff =
      ACCOUNT_CLASS_ORDER.indexOf(left.accountClass) -
      ACCOUNT_CLASS_ORDER.indexOf(right.accountClass);
    return (
      classDiff || left.accountStableId.localeCompare(right.accountStableId)
    );
  });

  const totals = rows.reduce<AccountingTrialBalanceTotalsV1>(
    (sum, row) => ({
      openingDebitBalanceCents: safeAdd(
        sum.openingDebitBalanceCents,
        row.openingDebitBalanceCents,
        'Trial Balance opening debit balance',
      ),
      openingCreditBalanceCents: safeAdd(
        sum.openingCreditBalanceCents,
        row.openingCreditBalanceCents,
        'Trial Balance opening credit balance',
      ),
      periodDebitCents: safeAdd(
        sum.periodDebitCents,
        row.periodDebitCents,
        'Trial Balance period debit',
      ),
      periodCreditCents: safeAdd(
        sum.periodCreditCents,
        row.periodCreditCents,
        'Trial Balance period credit',
      ),
      closingDebitBalanceCents: safeAdd(
        sum.closingDebitBalanceCents,
        row.closingDebitBalanceCents,
        'Trial Balance closing debit balance',
      ),
      closingCreditBalanceCents: safeAdd(
        sum.closingCreditBalanceCents,
        row.closingCreditBalanceCents,
        'Trial Balance closing credit balance',
      ),
    }),
    {
      openingDebitBalanceCents: 0,
      openingCreditBalanceCents: 0,
      periodDebitCents: 0,
      periodCreditCents: 0,
      closingDebitBalanceCents: 0,
      closingCreditBalanceCents: 0,
    },
  );

  if (
    totals.openingDebitBalanceCents !== totals.openingCreditBalanceCents ||
    totals.periodDebitCents !== totals.periodCreditCents ||
    totals.closingDebitBalanceCents !== totals.closingCreditBalanceCents
  ) {
    throw new Error('Trial Balance projection is not balanced');
  }

  return {
    accounts: rows,
    totals,
    openingBalanceJournal: {
      entryCount: openingEntryIds.size,
      debitCents: openingJournalDebitCents,
      creditCents: openingJournalCreditCents,
    },
  };
}
