import type { AccountingFinancialProvider } from './accounting-contracts';

export type AccountingProviderPayoutBankMatchStatus =
  | 'EXACT_EXISTING_PAYOUT'
  | 'AMBIGUOUS_EXISTING_PAYOUT'
  | 'POSSIBLE_EXISTING_PAYOUT'
  | 'UNMATCHED';

export type AccountingProviderPayoutBankMatchCandidate = {
  payoutStableId: string;
  provider: AccountingFinancialProvider;
  payoutDate: string;
  amountCents: number;
  providerReference: string | null;
  journalEntryStableId: string | null;
  dateDistanceDays: number;
  providerHintMatch: boolean | null;
};

export type AccountingProviderPayoutBankMatchDeposit = {
  rowNumber: number;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
  status: AccountingProviderPayoutBankMatchStatus;
  candidates: AccountingProviderPayoutBankMatchCandidate[];
};

export type AccountingProviderPayoutBankMatchPreview = {
  version: 1;
  scope: 'PROVIDER_PAYOUT_BANK_MATCH_PREVIEW';
  artifactStableId: string;
  filename: string;
  storeStableId: string;
  destinationBankAccountStableId: string;
  currency: 'CAD';
  deposits: AccountingProviderPayoutBankMatchDeposit[];
  source: {
    depositRowCount: number;
    withdrawalRowCount: number;
    invalidRowCount: number;
    invalidRows: Array<{
      rowNumber: number;
      reason:
        | 'COLUMN_COUNT_MISMATCH'
        | 'INVALID_DATE'
        | 'INVALID_INFLOW'
        | 'INVALID_OUTFLOW'
        | 'BOTH_DIRECTIONS';
    }>;
  };
  counts: {
    exactExisting: number;
    ambiguousExisting: number;
    possibleExisting: number;
    unmatched: number;
  };
};
