import type {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import type { AccountingTrialBalanceNormalSideV1 } from './accounting-trial-balance.contract';

export type AccountingStatementDrillThroughPhaseV1 =
  | 'OPENING'
  | 'PERIOD'
  | 'CLOSING';

export type AccountingStatementJournalLineV1 = {
  lineNo: number;
  debitCents: number;
  creditCents: number;
  memo: string | null;
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccountClass;
  accountType: AccountingAccountType | null;
  categoryStableId: string | null;
  categoryName: string | null;
  categoryType: string | null;
};

export type AccountingStatementJournalEntryV1 = {
  entryStableId: string;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: string;
  currency: string;
  memo: string | null;
  accountDebitCents: number;
  accountCreditCents: number;
  accountNormalMovementCents: number;
  entryDebitCents: number;
  entryCreditCents: number;
  highlightedLineNos: number[];
  lines: AccountingStatementJournalLineV1[];
};

export type AccountingStatementJournalDrillThroughV1 = {
  version: 1;
  scope: 'WHOLE_LEDGER';
  phase: AccountingStatementDrillThroughPhaseV1;
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  account: {
    accountStableId: string;
    accountName: string;
    accountClass: AccountingAccountClass;
    accountType: AccountingAccountType | null;
    currency: string;
    isActive: boolean;
    normalSide: AccountingTrialBalanceNormalSideV1;
  };
  pageSummary: {
    journalEntryCount: number;
    accountDebitCents: number;
    accountCreditCents: number;
    accountNormalMovementCents: number;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  entries: AccountingStatementJournalEntryV1[];
};
