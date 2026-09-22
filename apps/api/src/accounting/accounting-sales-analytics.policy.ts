import type { OrderSalesPrimaryPaymentMethodEvidenceV1 } from '../orders/public-api';

export const ACCOUNTING_SALES_SOURCE_FACT_TYPES = [
  'order.financial_sale.v1',
  'order.financial_adjustment.v1',
  'order.financial_reversal.v1',
  'accounting.provider_financial_document.v1',
  'accounting.uber_pre_cutover_order_reversal.v1',
] as const;

export type AccountingSalesSourceFactTypeV1 =
  (typeof ACCOUNTING_SALES_SOURCE_FACT_TYPES)[number];

/**
 * Account mapping is necessary but not sufficient for Sales Analytics.
 * Callers must first restrict Journal entries to canonical sales/provider facts;
 * generic Expense/Payroll/Manual journals may use some of the same accounts.
 */
export const ACCOUNTING_SALES_ACCOUNT_COMPONENT_POLICY = {
  account_sales_revenue: {
    component: 'GROSS_SALES',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_sales_discounts: {
    component: 'SALES_DISCOUNTS',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_delivery_revenue: {
    component: 'DELIVERY_REVENUE',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_card_surcharge_revenue: {
    component: 'CARD_SURCHARGE_REVENUE',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_hst_payable: {
    component: 'OUTPUT_TAX',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_tip_revenue: {
    component: 'TIP_REVENUE',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_other_operating_revenue: {
    component: 'OTHER_OPERATING_REVENUE',
    sign: 'CREDIT_MINUS_DEBIT',
  },
  account_platform_commission_expense: {
    component: 'PLATFORM_COMMISSION',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_payment_processing_fee_expense: {
    component: 'PAYMENT_PROCESSING_FEE',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_platform_promotion_expense: {
    component: 'PLATFORM_PROMOTION',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_advertising_expense: {
    component: 'ADVERTISING',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_chargeback_adjustment_expense: {
    component: 'CHARGEBACK',
    sign: 'DEBIT_MINUS_CREDIT',
  },
  account_general_operating_expense: {
    component: 'PROVIDER_OTHER_FEE',
    sign: 'DEBIT_MINUS_CREDIT',
  },
} as const;

type AccountingSalesAccountStableId =
  keyof typeof ACCOUNTING_SALES_ACCOUNT_COMPONENT_POLICY;
type SalesAccountPolicy =
  (typeof ACCOUNTING_SALES_ACCOUNT_COMPONENT_POLICY)[AccountingSalesAccountStableId];

export type AccountingSalesComponentV1 = SalesAccountPolicy['component'];

export type AccountingSalesComponentAmountV1 = {
  component: AccountingSalesComponentV1;
  amountCents: number;
};

export type AccountingSalesSummaryV1 = {
  grossSalesCents: number;
  discountsCents: number;
  netFoodSalesCents: number;
  deliveryRevenueCents: number;
  cardSurchargeRevenueCents: number;
  netSalesRevenueCents: number;
  outputTaxCents: number;
  tipsCents: number;
  otherOperatingRevenueCents: number;
  platformCommissionCents: number;
  paymentProcessingFeeCents: number;
  platformPromotionCents: number;
  advertisingCents: number;
  chargebackCents: number;
  providerOtherFeeCents: number;
  contributionCents: number;
};

export const ACCOUNTING_SALES_TENDER_ACCOUNT_POLICY = {
  account_store_cash: 'STORE_CASH_EQUIVALENT',
  account_clover_pending: 'CLOVER_CARD',
  account_uber_pending: 'UBER_EATS',
  account_fantuan_pending: 'FANTUAN',
  account_store_balance_liability: 'STORE_BALANCE',
} as const;

type AccountingSalesTenderAccountStableId =
  keyof typeof ACCOUNTING_SALES_TENDER_ACCOUNT_POLICY;

export type AccountingSalesTenderBucketV1 =
  (typeof ACCOUNTING_SALES_TENDER_ACCOUNT_POLICY)[AccountingSalesTenderAccountStableId];

export type AccountingSalesTenderAmountV1 = {
  tender: AccountingSalesTenderBucketV1;
  amountCents: number;
};

export type AccountingSalesAttributionQualityV1 =
  | 'IMMUTABLE'
  | 'LEGACY_CURRENT_ORDER'
  | 'MISSING';

export type AccountingSalesProviderCoverageStatusV1 =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type AccountingSalesProviderCoverageEvidenceV1 = {
  financialHistoryRequiredFrom: string;
  financialCompleteThrough: string | null;
};

const assertMinorUnits = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
};

const requireDateOnly = (value: string, field: string): string => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be a valid ISO date-only value`);
  }
  return value;
};

export function isAccountingSalesSourceFactType(
  sourceFactType: string | null,
): sourceFactType is AccountingSalesSourceFactTypeV1 {
  return ACCOUNTING_SALES_SOURCE_FACT_TYPES.some(
    (candidate) => candidate === sourceFactType,
  );
}

export function projectAccountingSalesComponentLine(params: {
  accountStableId: string;
  debitCents: number;
  creditCents: number;
}): AccountingSalesComponentAmountV1 | null {
  assertMinorUnits(params.debitCents, 'debitCents');
  assertMinorUnits(params.creditCents, 'creditCents');
  const policy =
    ACCOUNTING_SALES_ACCOUNT_COMPONENT_POLICY[
      params.accountStableId as AccountingSalesAccountStableId
    ];
  if (!policy) return null;
  const amountCents =
    policy.sign === 'CREDIT_MINUS_DEBIT'
      ? params.creditCents - params.debitCents
      : params.debitCents - params.creditCents;
  return { component: policy.component, amountCents };
}

export function projectAccountingSalesTenderLine(params: {
  accountStableId: string;
  debitCents: number;
  creditCents: number;
}): AccountingSalesTenderAmountV1 | null {
  assertMinorUnits(params.debitCents, 'debitCents');
  assertMinorUnits(params.creditCents, 'creditCents');
  const tender =
    ACCOUNTING_SALES_TENDER_ACCOUNT_POLICY[
      params.accountStableId as AccountingSalesTenderAccountStableId
    ];
  if (!tender) return null;
  return {
    tender,
    amountCents: params.debitCents - params.creditCents,
  };
}

export function summarizeAccountingSalesComponents(
  components: AccountingSalesComponentAmountV1[],
): AccountingSalesSummaryV1 {
  const totals = new Map<AccountingSalesComponentV1, number>();
  for (const row of components) {
    if (!Number.isSafeInteger(row.amountCents)) {
      throw new Error('sales component amountCents must be a safe integer');
    }
    totals.set(
      row.component,
      (totals.get(row.component) ?? 0) + row.amountCents,
    );
  }
  const amount = (component: AccountingSalesComponentV1) =>
    totals.get(component) ?? 0;

  const grossSalesCents = amount('GROSS_SALES');
  const discountsCents = amount('SALES_DISCOUNTS');
  const netFoodSalesCents = grossSalesCents - discountsCents;
  const deliveryRevenueCents = amount('DELIVERY_REVENUE');
  const cardSurchargeRevenueCents = amount('CARD_SURCHARGE_REVENUE');
  const netSalesRevenueCents =
    netFoodSalesCents + deliveryRevenueCents + cardSurchargeRevenueCents;
  const tipsCents = amount('TIP_REVENUE');
  const otherOperatingRevenueCents = amount('OTHER_OPERATING_REVENUE');
  const platformCommissionCents = amount('PLATFORM_COMMISSION');
  const paymentProcessingFeeCents = amount('PAYMENT_PROCESSING_FEE');
  const platformPromotionCents = amount('PLATFORM_PROMOTION');
  const advertisingCents = amount('ADVERTISING');
  const chargebackCents = amount('CHARGEBACK');
  const providerOtherFeeCents = amount('PROVIDER_OTHER_FEE');

  return {
    grossSalesCents,
    discountsCents,
    netFoodSalesCents,
    deliveryRevenueCents,
    cardSurchargeRevenueCents,
    netSalesRevenueCents,
    outputTaxCents: amount('OUTPUT_TAX'),
    tipsCents,
    otherOperatingRevenueCents,
    platformCommissionCents,
    paymentProcessingFeeCents,
    platformPromotionCents,
    advertisingCents,
    chargebackCents,
    providerOtherFeeCents,
    contributionCents:
      netSalesRevenueCents -
      platformCommissionCents -
      paymentProcessingFeeCents -
      platformPromotionCents,
  };
}

export function resolveAccountingSalesAttributionQuality(
  primaryPaymentMethodEvidence: OrderSalesPrimaryPaymentMethodEvidenceV1 | null,
): AccountingSalesAttributionQualityV1 {
  if (primaryPaymentMethodEvidence === 'IMMUTABLE_SALE_SNAPSHOT') {
    return 'IMMUTABLE';
  }
  if (primaryPaymentMethodEvidence === 'LEGACY_CURRENT_ORDER') {
    return 'LEGACY_CURRENT_ORDER';
  }
  return 'MISSING';
}

export function resolveAccountingSalesProviderCoverage(params: {
  requestedFrom: string;
  requestedTo: string;
  applicable: boolean;
  coverage: AccountingSalesProviderCoverageEvidenceV1 | null;
}): AccountingSalesProviderCoverageStatusV1 {
  const requestedFrom = requireDateOnly(params.requestedFrom, 'requestedFrom');
  const requestedTo = requireDateOnly(params.requestedTo, 'requestedTo');
  if (requestedTo < requestedFrom) {
    throw new Error('requestedTo must be on or after requestedFrom');
  }
  if (!params.applicable) return 'NOT_APPLICABLE';
  if (!params.coverage) return 'UNKNOWN';

  const requiredFrom = requireDateOnly(
    params.coverage.financialHistoryRequiredFrom,
    'financialHistoryRequiredFrom',
  );
  if (requestedTo < requiredFrom) return 'NOT_APPLICABLE';

  const completeThrough = params.coverage.financialCompleteThrough
    ? requireDateOnly(
        params.coverage.financialCompleteThrough,
        'financialCompleteThrough',
      )
    : null;
  return completeThrough && completeThrough >= requestedTo
    ? 'COMPLETE'
    : 'INCOMPLETE';
}
