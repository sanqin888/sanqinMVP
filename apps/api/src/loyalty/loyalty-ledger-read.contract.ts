export const LOYALTY_LEDGER_READER = Symbol('LOYALTY_LEDGER_READER');

export type LoyaltyLedgerReadTarget = 'POINTS' | 'BALANCE';

export type LoyaltyLedgerReadEntry = {
  ledgerStableId: string;
  createdAt: string;
  type: string;
  target: LoyaltyLedgerReadTarget;
  deltaPoints: number;
  balanceAfterPoints: number;
  note?: string;
  orderStableId?: string;
};

export type LoyaltyLedgerReadResult = {
  entries: LoyaltyLedgerReadEntry[];
};

export interface LoyaltyLedgerReaderPort {
  getLoyaltyLedger(input: {
    userStableId: string;
    limit: number;
    target?: LoyaltyLedgerReadTarget;
  }): Promise<LoyaltyLedgerReadResult>;
}
