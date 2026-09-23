import type {
  AccountingAccountClass,
  AccountingAccountType,
} from './accounting-contracts';

export type AccountingTrialBalanceNormalSideV1 = 'DEBIT' | 'CREDIT';

export type AccountingTrialBalanceAccountRowV1 = {
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccountClass;
  accountType: AccountingAccountType | null;
  currency: string;
  isActive: boolean;
  normalSide: AccountingTrialBalanceNormalSideV1;
  openingDebitBalanceCents: number;
  openingCreditBalanceCents: number;
  openingNormalBalanceCents: number;
  periodDebitCents: number;
  periodCreditCents: number;
  periodNormalMovementCents: number;
  closingDebitBalanceCents: number;
  closingCreditBalanceCents: number;
  closingNormalBalanceCents: number;
};

export type AccountingTrialBalanceTotalsV1 = {
  openingDebitBalanceCents: number;
  openingCreditBalanceCents: number;
  periodDebitCents: number;
  periodCreditCents: number;
  closingDebitBalanceCents: number;
  closingCreditBalanceCents: number;
};

export type AccountingTrialBalanceCloseStatusV1 = {
  months: Array<{
    periodKey: string;
    isClosed: boolean;
  }>;
  years: Array<{
    periodKey: string;
    isClosed: boolean;
  }>;
  allMonthsClosed: boolean;
};

export type AccountingTrialBalanceReportV1 = {
  version: 1;
  scope: 'WHOLE_LEDGER';
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  openingBalanceJournal: {
    entryCount: number;
    debitCents: number;
    creditCents: number;
  };
  totals: AccountingTrialBalanceTotalsV1;
  accounts: AccountingTrialBalanceAccountRowV1[];
  closeStatus: AccountingTrialBalanceCloseStatusV1;
};
