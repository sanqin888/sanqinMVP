import type { AccountingAccountType } from './accounting-contracts';
import type { AccountingTrialBalanceCloseStatusV1 } from './accounting-trial-balance.contract';

export type AccountingBalanceMovementAmountsV1 = {
  openingCumulativeCents: number;
  periodMovementCents: number;
  closingCumulativeCents: number;
};

export type AccountingBalanceMovementAccountRowV1 =
  AccountingBalanceMovementAmountsV1 & {
    accountStableId: string;
    accountName: string;
    accountType: AccountingAccountType | null;
    isActive: boolean;
  };

export type AccountingBalanceMovementSectionV1 =
  AccountingBalanceMovementAmountsV1 & {
    accounts: AccountingBalanceMovementAccountRowV1[];
  };

export type AccountingBalanceMovementEarningsBridgeV1 = {
  revenue: AccountingBalanceMovementAmountsV1;
  expense: AccountingBalanceMovementAmountsV1;
  recordedEarnings: AccountingBalanceMovementAmountsV1;
};

export type AccountingBalanceMovementBridgeSnapshotV1 = {
  assetsCents: number;
  liabilitiesCents: number;
  directEquityCents: number;
  recordedEarningsCents: number;
  totalEquityCents: number;
  reconciliationCents: number;
};

export type AccountingBalanceMovementOpeningBasisV1 = {
  kind: 'ZERO_MANAGEMENT_OPENING' | 'EXPLICIT_OPENING_JOURNAL';
  explicitOpeningJournalEntryCount: number;
  zeroOpeningDisclaimerRequired: boolean;
  absoluteBalanceClaim: false;
};

export type AccountingBalanceMovementReportV1 = {
  version: 1;
  statement: 'BALANCE_MOVEMENT';
  scope: 'WHOLE_LEDGER';
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  openingBasis: AccountingBalanceMovementOpeningBasisV1;
  openingBalanceJournal: {
    entryCount: number;
    debitCents: number;
    creditCents: number;
  };
  assets: AccountingBalanceMovementSectionV1;
  liabilities: AccountingBalanceMovementSectionV1;
  directEquity: AccountingBalanceMovementSectionV1;
  earningsBridge: AccountingBalanceMovementEarningsBridgeV1;
  bridge: {
    opening: AccountingBalanceMovementBridgeSnapshotV1;
    period: AccountingBalanceMovementBridgeSnapshotV1;
    closing: AccountingBalanceMovementBridgeSnapshotV1;
  };
  closeStatus: AccountingTrialBalanceCloseStatusV1;
};
