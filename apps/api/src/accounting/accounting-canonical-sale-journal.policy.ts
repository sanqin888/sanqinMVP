import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import type { OrderFinancialFactV1 } from '../orders/public-api';
import type {
  AccountingJournalCreateInput,
  AccountingJournalLineInput,
} from './accounting-journal-policy';

export const CANONICAL_SALE_SYSTEM_ACTOR = 'system:accounting-revenue-posting';
export const CANONICAL_SALE_SOURCE_FACT_TYPE = 'order.financial_sale.v1';

export type CanonicalSaleJournalPolicyErrorCode =
  | 'MISSING_STORE'
  | 'PRICING_INCOMPLETE'
  | 'INVALID_AMOUNT'
  | 'DISCOUNT_INVARIANT'
  | 'PRICING_INVARIANT'
  | 'ORDER_TOTAL_INVARIANT'
  | 'TENDER_INVARIANT'
  | 'SURCHARGE_TENDER_MISMATCH'
  | 'STORE_BALANCE_TENDER_MISMATCH'
  | 'NON_SALE_ORDER'
  | 'ZERO_VALUE_SALE';

export class CanonicalSaleJournalPolicyError extends Error {
  constructor(
    public readonly code: CanonicalSaleJournalPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalSaleJournalPolicyError';
  }
}

export type CanonicalSaleJournalDraft = {
  journal: AccountingJournalCreateInput;
  externalTenderCents: number;
  storeBalanceRedeemedCents: number;
  totalDiscountCents: number;
};

export const CANONICAL_SALE_ACCOUNT_IDS = {
  storeCash: 'account_store_cash',
  cloverPending: 'account_clover_pending',
  uberPending: 'account_uber_pending',
  storeBalanceLiability: 'account_store_balance_liability',
  hstPayable: 'account_hst_payable',
  salesRevenue: 'account_sales_revenue',
  deliveryRevenue: 'account_delivery_revenue',
  cardSurchargeRevenue: 'account_card_surcharge_revenue',
  salesDiscounts: 'account_sales_discounts',
} as const;

function assertMinorUnits(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanonicalSaleJournalPolicyError(
      'INVALID_AMOUNT',
      `${field} must be a non-negative safe integer`,
    );
  }
}

function safeSum(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    assertMinorUnits(value, field);
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new CanonicalSaleJournalPolicyError(
        'INVALID_AMOUNT',
        `${field} exceeds safe integer range`,
      );
    }
  }
  return total;
}

function externalTenderAccount(
  fact: OrderFinancialFactV1,
  externalTenderCents: number,
): string | null {
  if (externalTenderCents === 0) return null;

  switch (fact.paymentMethod) {
    case 'CASH':
    case 'WECHAT_ALIPAY':
      return CANONICAL_SALE_ACCOUNT_IDS.storeCash;
    case 'CARD':
      return CANONICAL_SALE_ACCOUNT_IDS.cloverPending;
    case 'UBEREATS':
      return CANONICAL_SALE_ACCOUNT_IDS.uberPending;
    case 'STORE_BALANCE':
      throw new CanonicalSaleJournalPolicyError(
        'STORE_BALANCE_TENDER_MISMATCH',
        'STORE_BALANCE sale cannot carry a positive external tender amount',
      );
    default:
      throw new CanonicalSaleJournalPolicyError(
        'TENDER_INVARIANT',
        `Unsupported payment method: ${String(fact.paymentMethod)}`,
      );
  }
}

function pushDebit(
  lines: AccountingJournalLineInput[],
  accountStableId: string,
  debitCents: number,
  memo: string,
): void {
  if (debitCents <= 0) return;
  lines.push({ accountStableId, debitCents, creditCents: 0, memo });
}

function pushCredit(
  lines: AccountingJournalLineInput[],
  accountStableId: string,
  creditCents: number,
  memo: string,
): void {
  if (creditCents <= 0) return;
  lines.push({ accountStableId, debitCents: 0, creditCents, memo });
}

export function buildCanonicalSaleJournal(params: {
  fact: OrderFinancialFactV1;
  storeBalanceRedeemedCents: number;
}): CanonicalSaleJournalDraft {
  const { fact, storeBalanceRedeemedCents } = params;
  const storeStableId = fact.storeStableId?.trim();
  if (!storeStableId) {
    throw new CanonicalSaleJournalPolicyError(
      'MISSING_STORE',
      'canonical sale posting requires storeStableId',
    );
  }
  if (!Number.isSafeInteger(fact.itemQuantity) || fact.itemQuantity <= 0) {
    throw new CanonicalSaleJournalPolicyError(
      'NON_SALE_ORDER',
      'canonical sale posting requires at least one sold item',
    );
  }

  if (
    fact.pricingEvidence !== 'COMPLETE' ||
    fact.nominalSubtotalCents === null ||
    fact.discounts.dailySpecialCents === null ||
    fact.discounts.totalCents === null
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'PRICING_INCOMPLETE',
      'canonical sale posting requires complete nominal pricing evidence',
    );
  }

  const nominalSubtotalCents = fact.nominalSubtotalCents;
  const dailySpecialCents = fact.discounts.dailySpecialCents;
  const totalDiscountCents = fact.discounts.totalCents;
  const discountComponents = [
    dailySpecialCents,
    fact.discounts.couponCents,
    fact.discounts.automaticPromotionCents,
    fact.discounts.posManualCents,
    fact.discounts.pointsRedemptionCents,
    fact.discounts.unattributedLegacyCents,
  ];

  const monetaryAmounts = [
    nominalSubtotalCents,
    fact.effectiveSubtotalCents,
    totalDiscountCents,
    fact.subtotalAfterDiscountCents,
    fact.taxCents,
    fact.deliveryRevenueCents,
    fact.cardSurchargeCents,
    fact.orderTotalCents,
    fact.paymentTotalCents,
    storeBalanceRedeemedCents,
  ];
  monetaryAmounts.forEach((value, index) =>
    assertMinorUnits(value, `saleAmount[${index}]`),
  );

  const computedDiscountCents = safeSum(
    discountComponents,
    'discount components',
  );
  if (computedDiscountCents !== totalDiscountCents) {
    throw new CanonicalSaleJournalPolicyError(
      'DISCOUNT_INVARIANT',
      `discount components (${computedDiscountCents}) do not equal total discount (${totalDiscountCents})`,
    );
  }

  if (
    nominalSubtotalCents - dailySpecialCents !==
    fact.effectiveSubtotalCents
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'PRICING_INVARIANT',
      'nominal subtotal minus Daily Special discount must equal effectiveSubtotalCents',
    );
  }

  const postEffectiveDiscountCents = safeSum(
    [
      fact.discounts.couponCents,
      fact.discounts.automaticPromotionCents,
      fact.discounts.posManualCents,
      fact.discounts.pointsRedemptionCents,
      fact.discounts.unattributedLegacyCents,
    ],
    'post-effective discount components',
  );
  if (
    fact.effectiveSubtotalCents - postEffectiveDiscountCents !==
    fact.subtotalAfterDiscountCents
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'PRICING_INVARIANT',
      'effective subtotal minus non-Daily-Special discounts must equal subtotalAfterDiscountCents',
    );
  }

  if (
    nominalSubtotalCents - totalDiscountCents !==
    fact.subtotalAfterDiscountCents
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'PRICING_INVARIANT',
      'nominal subtotal minus discounts must equal subtotalAfterDiscountCents',
    );
  }

  if (
    fact.subtotalAfterDiscountCents +
      fact.taxCents +
      fact.deliveryRevenueCents !==
    fact.orderTotalCents
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'ORDER_TOTAL_INVARIANT',
      'subtotalAfterDiscountCents + taxCents + deliveryRevenueCents must equal orderTotalCents',
    );
  }

  if (fact.cardSurchargeCents > 0 && fact.paymentMethod !== 'CARD') {
    throw new CanonicalSaleJournalPolicyError(
      'SURCHARGE_TENDER_MISMATCH',
      'positive card surcharge requires CARD payment method',
    );
  }

  const externalTenderCents = fact.paymentTotalCents;
  if (
    externalTenderCents + storeBalanceRedeemedCents !==
    fact.orderTotalCents + fact.cardSurchargeCents
  ) {
    throw new CanonicalSaleJournalPolicyError(
      'TENDER_INVARIANT',
      'external tender + Store Balance redemption must equal order total + card surcharge',
    );
  }

  const lines: AccountingJournalLineInput[] = [];
  const tenderAccount = externalTenderAccount(fact, externalTenderCents);
  if (tenderAccount) {
    pushDebit(
      lines,
      tenderAccount,
      externalTenderCents,
      `External tender for ${fact.orderStableId}`,
    );
  }
  pushDebit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.storeBalanceLiability,
    storeBalanceRedeemedCents,
    `Store Balance redeemed for ${fact.orderStableId}`,
  );
  pushDebit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.salesDiscounts,
    totalDiscountCents,
    `Sales discounts for ${fact.orderStableId}`,
  );
  pushCredit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.salesRevenue,
    nominalSubtotalCents,
    `Gross sales revenue for ${fact.orderStableId}`,
  );
  pushCredit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.deliveryRevenue,
    fact.deliveryRevenueCents,
    `Delivery revenue for ${fact.orderStableId}`,
  );
  pushCredit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.hstPayable,
    fact.taxCents,
    `HST/GST payable for ${fact.orderStableId}`,
  );
  pushCredit(
    lines,
    CANONICAL_SALE_ACCOUNT_IDS.cardSurchargeRevenue,
    fact.cardSurchargeCents,
    `Card surcharge revenue for ${fact.orderStableId}`,
  );

  if (lines.length < 2) {
    throw new CanonicalSaleJournalPolicyError(
      'ZERO_VALUE_SALE',
      'canonical sale has no positive accounting value to post',
    );
  }

  return {
    journal: {
      idempotencyKey: `canonical-sale:${fact.orderStableId}:v1`,
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.ORDER,
      sourceFactType: CANONICAL_SALE_SOURCE_FACT_TYPE,
      sourceFactStableId: fact.factStableId,
      sourceFactVersion: fact.version,
      storeStableId,
      occurredAt: fact.occurredAt.toISOString(),
      currency: fact.currency,
      memo: `Canonical sale ${fact.orderStableId}`,
      lines,
    },
    externalTenderCents,
    storeBalanceRedeemedCents,
    totalDiscountCents,
  };
}
