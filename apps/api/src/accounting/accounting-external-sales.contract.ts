// Accounting-owned External Sales source-fact contracts.
//
// These contracts intentionally describe non-Order sales in generic commercial
// terms. Sales modes are data-driven classifications, not schema/type enums.
// Persistence and runtime Journal wiring are later slices.

export const ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE =
  'accounting.external_sale.v1';
export const ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_VERSION = 1;

export const ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE =
  'accounting.external_sale_settlement.v1';
export const ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_VERSION = 1;

export const ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.external_sale_reversal.v1';
export const ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.external_sale_settlement_reversal.v1';

export const ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID =
  'account_accounts_receivable';

export const AccountingExternalSaleGranularity = {
  TRANSACTION: 'TRANSACTION',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  PERIOD_SUMMARY: 'PERIOD_SUMMARY',
} as const;

export type AccountingExternalSaleGranularity =
  (typeof AccountingExternalSaleGranularity)[keyof typeof AccountingExternalSaleGranularity];

export type AccountingExternalSaleLineInputV1 = {
  description: string;
  productReference?: string | null;
  /**
   * Exact decimal quantity encoded as a string. V1 accepts up to four decimal
   * places so quantity arithmetic never depends on binary floating point.
   */
  quantity: string;
  unit: string;
  /**
   * The negotiated commercial unit price before separately stated sales tax.
   * It is not derived from SanQ retail/catalog pricing.
   */
  unitPriceCents: number;
  /**
   * Frozen extended amount after deterministic quantity x unit-price rounding.
   */
  lineAmountCents: number;
  revenueAccountStableId: string;
};

export type AccountingExternalSaleAdjustmentInputV1 = {
  label: string;
  /**
   * Signed pre-tax revenue adjustment. Positive increases the receivable and
   * credited revenue; negative reduces it through a revenue-account debit.
   */
  amountCents: number;
  revenueAccountStableId: string;
};

export type AccountingExternalSaleTaxInputV1 = {
  taxCode: string;
  label: string;
  /**
   * Descriptive evidence only. The tax amount remains explicit authority and is
   * never recomputed or guessed from this optional rate.
   */
  rateBasisPoints?: number | null;
  amountCents: number;
  liabilityAccountStableId: string;
};

export type CreateAccountingExternalSaleInputV1 = {
  requestId: string;
  storeStableId: string;
  classificationStableId: string;
  granularity: AccountingExternalSaleGranularity;
  occurredOn: string;
  periodStartOn?: string | null;
  periodEndOn?: string | null;
  counterpartyName: string;
  reference?: string | null;
  currency?: string;
  replacementForExternalSaleStableId?: string | null;
  lines: AccountingExternalSaleLineInputV1[];
  adjustments?: AccountingExternalSaleAdjustmentInputV1[];
  taxes?: AccountingExternalSaleTaxInputV1[];
  note?: string | null;
};

export type AccountingExternalSaleLineFactV1 = {
  lineStableId: string;
  description: string;
  productReference: string | null;
  quantity: string;
  unit: string;
  unitPriceCents: number;
  lineAmountCents: number;
  revenueAccountStableId: string;
  sortOrder: number;
};

export type AccountingExternalSaleAdjustmentFactV1 = {
  adjustmentStableId: string;
  label: string;
  amountCents: number;
  revenueAccountStableId: string;
  sortOrder: number;
};

export type AccountingExternalSaleTaxFactV1 = {
  taxStableId: string;
  taxCode: string;
  label: string;
  rateBasisPoints: number | null;
  amountCents: number;
  liabilityAccountStableId: string;
  sortOrder: number;
};

export type AccountingExternalSaleFactV1 = {
  version: 1;
  externalSaleStableId: string;
  storeStableId: string;
  classificationStableId: string;
  granularity: AccountingExternalSaleGranularity;
  occurredOn: string;
  periodStartOn: string | null;
  periodEndOn: string | null;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  replacementForExternalSaleStableId: string | null;
  lines: AccountingExternalSaleLineFactV1[];
  adjustments: AccountingExternalSaleAdjustmentFactV1[];
  taxes: AccountingExternalSaleTaxFactV1[];
  note: string | null;
};

export type AccountingExternalSaleTotalsV1 = {
  lineSubtotalCents: number;
  adjustmentTotalCents: number;
  taxTotalCents: number;
  totalReceivableCents: number;
};

export type AccountingExternalSaleSettlementAllocationInputV1 = {
  externalSaleStableId: string;
  amountCents: number;
};

export type AccountingExternalSaleSettlementComponentInputV1 = {
  accountStableId: string;
  amountCents: number;
  label: string;
};

export type CreateAccountingExternalSaleSettlementInputV1 = {
  requestId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  reference?: string | null;
  currency?: string;
  replacementForSettlementStableId?: string | null;
  allocations: AccountingExternalSaleSettlementAllocationInputV1[];
  components: AccountingExternalSaleSettlementComponentInputV1[];
  note?: string | null;
};

export type AccountingExternalSaleSettlementAllocationFactV1 = {
  allocationStableId: string;
  externalSaleStableId: string;
  amountCents: number;
  sortOrder: number;
};

export type AccountingExternalSaleSettlementComponentFactV1 = {
  componentStableId: string;
  accountStableId: string;
  amountCents: number;
  label: string;
  sortOrder: number;
};

export type AccountingExternalSaleSettlementFactV1 = {
  version: 1;
  settlementStableId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  replacementForSettlementStableId: string | null;
  allocations: AccountingExternalSaleSettlementAllocationFactV1[];
  components: AccountingExternalSaleSettlementComponentFactV1[];
  note: string | null;
};

export type ReverseAccountingExternalSaleInputV1 = {
  reason: string;
};

export type AccountingExternalSalePostingLineV1 = {
  accountStableId: string;
  debitCents: number;
  creditCents: number;
  memo: string;
};

export type AccountingExternalSalePostingDraftV1 = {
  kind: 'STANDARD';
  source: 'EXTERNAL_SALE';
  sourceFactType:
    | typeof ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE
    | typeof ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE;
  sourceFactStableId: string;
  sourceFactVersion: 1;
  storeStableId: string;
  occurredOn: string;
  currency: 'CAD';
  memo: string;
  lines: AccountingExternalSalePostingLineV1[];
};
