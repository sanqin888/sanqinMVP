export const LOYALTY_FINANCIAL_FACTS_READER = Symbol(
  'LOYALTY_FINANCIAL_FACTS_READER',
);

export type LoyaltyFinancialFactKindV1 =
  | 'STORE_BALANCE_TOPUP'
  | 'STORE_BALANCE_REDEEMED'
  | 'STORE_BALANCE_RETURNED';

/**
 * Canonical Benefits/Loyalty money fact for Store Balance principal movement.
 * Points redemption's monetary discount value remains part of the Orders pricing
 * fact; this contract owns only the Store Balance liability/tender movements.
 */
export type LoyaltyFinancialFactV1 = {
  version: 1;
  /** LoyaltyLedger.ledgerStableId; never the ledger DB UUID. */
  factStableId: string;
  kind: LoyaltyFinancialFactKindV1;
  occurredAt: Date;
  orderStableId: string | null;
  sourceKey: string;
  currency: 'CAD';
  amountCents: number;
};

export type LoyaltyFinancialFactsRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
};

export interface LoyaltyFinancialFactsReaderPort {
  readFactsByOrderStableId(
    orderStableId: string,
  ): Promise<LoyaltyFinancialFactV1[]>;
  readFactsForRange(
    range: LoyaltyFinancialFactsRangeV1,
  ): Promise<LoyaltyFinancialFactV1[]>;
}
