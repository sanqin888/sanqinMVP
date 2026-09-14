import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';

import type { LoyaltyFinancialFactV1 } from '../loyalty/public-api';
import type {
  OrderFinancialChangeFactV1,
  OrderFinancialChangePaymentMethodV1,
  OrderFinancialChangeStateV1,
  OrderFinancialFactV1,
} from '../orders/public-api';
import type {
  PaymentFinancialFactV1,
  PaymentReversalFinancialFactV1,
} from '../payments/public-api';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';
import { CANONICAL_SALE_ACCOUNT_IDS } from './accounting-canonical-sale-journal.policy';

export const CANONICAL_ADJUSTMENT_SOURCE_FACT_TYPE =
  'order.financial_adjustment.v1';
export const CANONICAL_REVERSAL_SOURCE_FACT_TYPE =
  'order.financial_reversal.v1';

export type CanonicalChangeBlockCode =
  | 'WAITING_FOR_ORIGINAL_SALE_JOURNAL'
  | 'WAITING_FOR_PAYMENT_EVIDENCE'
  | 'WAITING_FOR_LOYALTY_EVIDENCE'
  | 'WAITING_FOR_ORDER_EVIDENCE'
  | 'UNMATCHED_PAYMENT_REVERSAL'
  | 'AMBIGUOUS_PAYMENT_REVERSAL'
  | 'SETTLEMENT_AMOUNT_MISMATCH'
  | 'SETTLEMENT_METHOD_MISMATCH'
  | 'OCCURRENCE_EVIDENCE_INSUFFICIENT'
  | 'ECONOMIC_STATE_INCOMPLETE'
  | 'HISTORICAL_OVERRIDE_REQUIRED'
  | 'UNRESOLVED';

export type CanonicalChangeClassification =
  | 'READY'
  | 'READY_NOOP'
  | CanonicalChangeBlockCode;
export type CanonicalCardSettlementEvidenceMode =
  | 'LEGACY_ORDER_DECLARED'
  | 'STRICT_PAYMENT_EVIDENCE'
  | 'UNRESOLVED';
export type CanonicalChangeBlockReason = {
  code: CanonicalChangeBlockCode;
  message: string;
};
export type CanonicalChangeJournalPolicyResult = {
  status: 'READY' | 'BLOCKED';
  classification: CanonicalChangeClassification;
  blockReasons: CanonicalChangeBlockReason[];
  journal: AccountingJournalCreateInput | null;
  cardSettlementEvidenceMode: CanonicalCardSettlementEvidenceMode | null;
  matchedPaymentFactStableIds: string[];
  matchedPaymentReversalFactStableIds: string[];
  matchedLoyaltyFactStableIds: string[];
};

export type CanonicalChangeJournalPolicyInput = {
  change: OrderFinancialChangeFactV1;
  originalSale: OrderFinancialFactV1 | null;
  originalSaleJournalEntryStableId: string | null;
  paymentFacts: PaymentFinancialFactV1[];
  paymentReversalFacts: PaymentReversalFinancialFactV1[];
  loyaltyFacts: LoyaltyFinancialFactV1[];
  cardSettlementEvidenceMode: CanonicalCardSettlementEvidenceMode | null;
};

type EconomicState = {
  nominalSubtotalCents: number;
  salesDiscountCents: number;
  taxCents: number;
  deliveryRevenueCents: number;
  cardSurchargeCents: number;
};

const addSafe = (a: number, b: number, field: string): number => {
  const value = a + b;
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(`${field} must use safe integer minor units`);
  }
  return value;
};

const sumLoyalty = (
  facts: LoyaltyFinancialFactV1[],
  kind: LoyaltyFinancialFactV1['kind'],
) =>
  facts.reduce(
    (sum, fact) =>
      fact.kind === kind ? addSafe(sum, fact.amountCents, kind) : sum,
    0,
  );

const sameAsOriginalSale = (
  state: OrderFinancialChangeStateV1,
  sale: OrderFinancialFactV1,
) =>
  state.itemQuantity === sale.itemQuantity &&
  state.paymentMethod === sale.paymentMethod &&
  state.effectiveSubtotalCents === sale.effectiveSubtotalCents &&
  state.subtotalAfterDiscountCents === sale.subtotalAfterDiscountCents &&
  state.taxCents === sale.taxCents &&
  state.deliveryRevenueCents === sale.deliveryRevenueCents &&
  state.cardSurchargeCents === sale.cardSurchargeCents &&
  state.orderTotalCents === sale.orderTotalCents &&
  state.paymentTotalCents === sale.paymentTotalCents;

const resolveEconomic = (
  state: OrderFinancialChangeStateV1,
  sale: OrderFinancialFactV1 | null,
  allowSaleFallback: boolean,
): EconomicState | null => {
  if (
    state.nominalSubtotalCents !== null &&
    state.salesDiscountCents !== null
  ) {
    return {
      nominalSubtotalCents: state.nominalSubtotalCents,
      salesDiscountCents: state.salesDiscountCents,
      taxCents: state.taxCents,
      deliveryRevenueCents: state.deliveryRevenueCents,
      cardSurchargeCents: state.cardSurchargeCents,
    };
  }
  if (
    allowSaleFallback &&
    sale?.pricingEvidence === 'COMPLETE' &&
    sale.nominalSubtotalCents !== null &&
    sale.discounts.totalCents !== null &&
    sameAsOriginalSale(state, sale)
  ) {
    return {
      nominalSubtotalCents: sale.nominalSubtotalCents,
      salesDiscountCents: sale.discounts.totalCents,
      taxCents: sale.taxCents,
      deliveryRevenueCents: sale.deliveryRevenueCents,
      cardSurchargeCents: sale.cardSurchargeCents,
    };
  }
  return null;
};

const retenderEconomicsUnchanged = (
  a: OrderFinancialChangeStateV1,
  b: OrderFinancialChangeStateV1,
) =>
  a.itemQuantity === b.itemQuantity &&
  a.nominalSubtotalCents === b.nominalSubtotalCents &&
  a.effectiveSubtotalCents === b.effectiveSubtotalCents &&
  a.salesDiscountCents === b.salesDiscountCents &&
  a.subtotalAfterDiscountCents === b.subtotalAfterDiscountCents &&
  a.taxCents === b.taxCents &&
  a.deliveryRevenueCents === b.deliveryRevenueCents &&
  a.cardSurchargeCents === b.cardSurchargeCents &&
  a.orderTotalCents === b.orderTotalCents &&
  a.paymentTotalCents === b.paymentTotalCents;

const usesCardSettlement = (change: OrderFinancialChangeFactV1): boolean =>
  change.settlement.previousOrderPaymentMethod === 'CARD' ||
  change.settlement.resultingOrderPaymentMethod === 'CARD' ||
  change.settlement.declaredSettlementPaymentMethod === 'CARD';

const accountForTender = (
  method: OrderFinancialChangePaymentMethodV1,
): string => {
  switch (method) {
    case 'CASH':
    case 'WECHAT_ALIPAY':
      return CANONICAL_SALE_ACCOUNT_IDS.storeCash;
    case 'CARD':
      return CANONICAL_SALE_ACCOUNT_IDS.cloverPending;
    case 'UBEREATS':
      return CANONICAL_SALE_ACCOUNT_IDS.uberPending;
    case 'STORE_BALANCE':
      return CANONICAL_SALE_ACCOUNT_IDS.storeBalanceLiability;
  }
};

const addSigned = (
  target: Map<string, number>,
  account: string,
  amount: number,
) => {
  target.set(account, addSafe(target.get(account) ?? 0, amount, account));
};

const matchCardReversal = (
  change: OrderFinancialChangeFactV1,
  facts: PaymentReversalFinancialFactV1[],
  expectedBase: number,
  expectedAdditional: number,
  block: (code: CanonicalChangeBlockCode, message: string) => void,
): PaymentReversalFinancialFactV1 | null => {
  const sameOrder = facts.filter(
    (fact) =>
      fact.orderStableId === change.orderStableId &&
      fact.storeStableId === change.storeStableId &&
      fact.currency.toUpperCase() === change.currency,
  );
  if (sameOrder.length === 0) {
    block(
      'WAITING_FOR_PAYMENT_EVIDENCE',
      'CARD settlement has no Payments reversal fact',
    );
    return null;
  }
  const sameMethod = sameOrder.filter((fact) => fact.paymentMethod === 'CARD');
  if (sameMethod.length === 0) {
    block(
      'SETTLEMENT_METHOD_MISMATCH',
      'Payments reversal does not confirm CARD settlement',
    );
    return null;
  }
  const exact = sameMethod.filter(
    (fact) => fact.baseRefundCents === expectedBase,
  );
  if (exact.length === 0) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      `Payments base refund does not equal ${expectedBase} cents`,
    );
    return null;
  }
  if (exact.length > 1) {
    block(
      'AMBIGUOUS_PAYMENT_REVERSAL',
      'Multiple Payments reversals can satisfy this change',
    );
    return null;
  }
  const fact = exact[0];
  if (
    change.kind === 'REVERSAL' &&
    fact.kind !== 'FULL_REFUND' &&
    fact.kind !== 'VOID'
  ) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      'Full Order reversal lacks full provider reversal/void evidence',
    );
    return null;
  }
  if (fact.additionalChargeRefundCents === null) {
    const provesNoAdditional =
      expectedAdditional === 0 &&
      fact.originalSaleCustomerTotalCents !== null &&
      fact.originalSaleCustomerTotalCents === fact.originalSaleBaseAmountCents;
    if (!provesNoAdditional) {
      block(
        'WAITING_FOR_PAYMENT_EVIDENCE',
        'Provider reversal does not prove surcharge/additional-charge refund',
      );
      return null;
    }
  } else if (fact.additionalChargeRefundCents !== expectedAdditional) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      `Payments additional-charge refund does not equal ${expectedAdditional} cents`,
    );
    return null;
  }
  if (
    fact.customerRefundTotalCents !== null &&
    fact.customerRefundTotalCents !== expectedBase + expectedAdditional
  ) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      'Payments customer refund total differs from canonical expected refund',
    );
    return null;
  }
  return fact;
};

export const buildCanonicalChangeJournalPreview = (
  input: CanonicalChangeJournalPolicyInput,
): CanonicalChangeJournalPolicyResult => {
  const {
    change,
    originalSale,
    paymentFacts,
    paymentReversalFacts,
    loyaltyFacts,
    cardSettlementEvidenceMode,
  } = input;
  const reasons: CanonicalChangeBlockReason[] = [];
  const block = (code: CanonicalChangeBlockCode, message: string) => {
    if (
      !reasons.some(
        (reason) => reason.code === code && reason.message === message,
      )
    ) {
      reasons.push({ code, message });
    }
  };
  const matchedPayment = paymentFacts
    .filter((fact) => fact.orderStableId === change.orderStableId)
    .map((fact) => fact.factStableId);
  const matchedReversals: string[] = [];
  const matchedLoyalty: string[] = [];
  const loyaltyForOrder = loyaltyFacts.filter(
    (fact) => fact.orderStableId === change.orderStableId,
  );

  if (usesCardSettlement(change)) {
    if (cardSettlementEvidenceMode === null) {
      block('UNRESOLVED', 'CARD settlement evidence mode is unavailable');
    } else if (cardSettlementEvidenceMode === 'UNRESOLVED') {
      block(
        'UNRESOLVED',
        'POS CARD payment-route provenance is ambiguous for deterministic settlement evidence',
      );
    }
  }

  if (!originalSale) {
    block('UNRESOLVED', 'Original canonical Order SALE fact is unavailable');
  } else {
    if (originalSale.orderStableId !== change.orderStableId) {
      block(
        'UNRESOLVED',
        'Original SALE and change fact have different orderStableId',
      );
    }
    if (originalSale.storeStableId !== change.storeStableId) {
      block(
        'UNRESOLVED',
        'Original SALE and change fact have different storeStableId',
      );
    }
    if (originalSale.currency !== change.currency) {
      block(
        'UNRESOLVED',
        'Original SALE and change fact have different currency',
      );
    }
  }
  if (!input.originalSaleJournalEntryStableId) {
    block(
      'WAITING_FOR_ORIGINAL_SALE_JOURNAL',
      'Original canonical SALE must be journaled before a later change can be drafted',
    );
  }
  if (
    change.action === 'EXTERNAL_CANCELLATION' &&
    change.occurrenceEvidence !== 'PROVIDER_EVENT'
  ) {
    block(
      'OCCURRENCE_EVIDENCE_INSUFFICIENT',
      'External cancellation requires provider occurrence evidence',
    );
  }

  const signed = new Map<string, number>();
  if (change.action === 'RETENDER') {
    if (!retenderEconomicsUnchanged(change.before, change.after)) {
      block(
        'ECONOMIC_STATE_INCOMPLETE',
        'RETENDER must not change business economics',
      );
    }
    if (
      cardSettlementEvidenceMode !== 'LEGACY_ORDER_DECLARED' &&
      (change.settlement.previousOrderPaymentMethod === 'CARD' ||
        change.settlement.resultingOrderPaymentMethod === 'CARD') &&
      (change.before.cardSurchargeCents > 0 ||
        change.after.cardSurchargeCents > 0)
    ) {
      block(
        'WAITING_FOR_PAYMENT_EVIDENCE',
        'CARD RETENDER with surcharge lacks explicit surcharge settlement truth',
      );
    }
  } else {
    const before = resolveEconomic(
      change.before,
      originalSale,
      change.kind === 'REVERSAL',
    );
    const after = resolveEconomic(change.after, originalSale, false);
    if (!before || !after) {
      block(
        'ECONOMIC_STATE_INCOMPLETE',
        'Orders change fact lacks immutable nominal/discount evidence',
      );
    } else {
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.salesRevenue,
        -(after.nominalSubtotalCents - before.nominalSubtotalCents),
      );
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.salesDiscounts,
        after.salesDiscountCents - before.salesDiscountCents,
      );
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.hstPayable,
        -(after.taxCents - before.taxCents),
      );
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.deliveryRevenue,
        -(after.deliveryRevenueCents - before.deliveryRevenueCents),
      );
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.cardSurchargeRevenue,
        -(after.cardSurchargeCents - before.cardSurchargeCents),
      );
    }
  }

  const tenderRefund =
    change.settlement.refundGrossCents - change.settlement.redeemReturnCents;
  if (tenderRefund < 0) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      'redeemed-value return exceeds gross refund',
    );
  }
  const redeemedBalance = sumLoyalty(loyaltyForOrder, 'STORE_BALANCE_REDEEMED');
  const returnedBalanceFacts = loyaltyForOrder.filter(
    (fact) => fact.kind === 'STORE_BALANCE_RETURNED',
  );
  const returnedBalance = sumLoyalty(
    returnedBalanceFacts,
    'STORE_BALANCE_RETURNED',
  );

  const addSettlement = (
    method: OrderFinancialChangePaymentMethodV1,
    collected: number,
    refunded: number,
    surchargeRefund = 0,
  ) => {
    if (collected === 0 && refunded === 0 && surchargeRefund === 0) return;
    if (method === 'CARD') {
      if (collected > 0) {
        block(
          'WAITING_FOR_PAYMENT_EVIDENCE',
          'CARD collection lacks a change-scoped Payments money fact',
        );
      }
      if (
        cardSettlementEvidenceMode === 'STRICT_PAYMENT_EVIDENCE' &&
        (refunded > 0 || surchargeRefund > 0)
      ) {
        if (refunded <= 0) {
          block(
            'WAITING_FOR_PAYMENT_EVIDENCE',
            'Surcharge-only CARD reversal cannot be proven by the current Payments contract',
          );
        } else {
          const matched = matchCardReversal(
            change,
            paymentReversalFacts,
            refunded,
            surchargeRefund,
            block,
          );
          if (matched) matchedReversals.push(matched.factStableId);
        }
      }
    } else if (method === 'STORE_BALANCE') {
      if (collected > 0 || refunded > 0) {
        block(
          'WAITING_FOR_LOYALTY_EVIDENCE',
          'Store Balance mutation lacks change-scoped Loyalty principal correlation',
        );
      }
    } else if (
      method === 'UBEREATS' &&
      (collected > 0 ||
        change.action !== 'EXTERNAL_CANCELLATION' ||
        change.occurrenceEvidence !== 'PROVIDER_EVENT')
    ) {
      block(
        'SETTLEMENT_METHOD_MISMATCH',
        'Uber settlement is READY only for provider-confirmed external cancellation',
      );
    }
    addSigned(
      signed,
      accountForTender(method),
      collected - refunded - surchargeRefund,
    );
  };

  if (change.action === 'RETENDER') {
    const previous = change.settlement.previousOrderPaymentMethod;
    const resulting = change.settlement.resultingOrderPaymentMethod;
    if (
      change.settlement.declaredSettlementPaymentMethod !== null &&
      change.settlement.declaredSettlementPaymentMethod !== resulting
    ) {
      block(
        'SETTLEMENT_METHOD_MISMATCH',
        'RETENDER declared settlement method must equal resulting tender',
      );
    }
    addSettlement(previous, 0, Math.max(0, tenderRefund));
    addSettlement(resulting, change.settlement.additionalChargeCents, 0);
  } else if (change.kind === 'REVERSAL') {
    if (redeemedBalance > 0) {
      if (returnedBalance === 0) {
        block(
          'WAITING_FOR_LOYALTY_EVIDENCE',
          'Original Store Balance redemption has no Loyalty return fact',
        );
      } else if (returnedBalance !== redeemedBalance) {
        block(
          'SETTLEMENT_AMOUNT_MISMATCH',
          'Returned Store Balance does not equal original redeemed principal',
        );
      } else {
        matchedLoyalty.push(
          ...returnedBalanceFacts.map((fact) => fact.factStableId),
        );
      }
    } else if (returnedBalance > 0) {
      block(
        'SETTLEMENT_AMOUNT_MISMATCH',
        'Loyalty returned Store Balance without original redeemed principal',
      );
    }
    const balanceRefund = Math.min(Math.max(0, tenderRefund), returnedBalance);
    if (balanceRefund > 0) {
      addSigned(
        signed,
        CANONICAL_SALE_ACCOUNT_IDS.storeBalanceLiability,
        -balanceRefund,
      );
    }
    const externalRefund = Math.max(0, tenderRefund - balanceRefund);
    const surchargeRefund = Math.max(
      0,
      change.before.cardSurchargeCents - change.after.cardSurchargeCents,
    );
    if (externalRefund > 0 || surchargeRefund > 0) {
      const method = change.settlement.declaredSettlementPaymentMethod;
      if (!method) {
        block(
          'SETTLEMENT_METHOD_MISMATCH',
          'Reversal has external money movement without a declared tender',
        );
      } else {
        if (surchargeRefund > 0 && method !== 'CARD') {
          block(
            'SETTLEMENT_METHOD_MISMATCH',
            'Card surcharge reversal requires CARD provider-money evidence',
          );
        }
        addSettlement(method, 0, externalRefund, surchargeRefund);
      }
    }
  } else if (tenderRefund > 0 || change.settlement.additionalChargeCents > 0) {
    const method = change.settlement.declaredSettlementPaymentMethod;
    if (!method) {
      block(
        'SETTLEMENT_METHOD_MISMATCH',
        'Adjustment has settlement movement without a declared tender',
      );
    } else {
      addSettlement(
        method,
        change.settlement.additionalChargeCents,
        Math.max(0, tenderRefund),
      );
    }
  }

  const lines = [...signed.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountStableId, amount]) => ({
      accountStableId,
      debitCents: amount > 0 ? amount : 0,
      creditCents: amount < 0 ? -amount : 0,
      memo: `Canonical ${change.kind.toLowerCase()} ${change.factStableId}`,
    }));
  const debit = lines.reduce(
    (sum, line) => addSafe(sum, line.debitCents, 'journal debit'),
    0,
  );
  const credit = lines.reduce(
    (sum, line) => addSafe(sum, line.creditCents, 'journal credit'),
    0,
  );
  if (debit !== credit) {
    block(
      'SETTLEMENT_AMOUNT_MISMATCH',
      `Canonical economics and settlement do not balance (${debit} vs ${credit})`,
    );
  }

  const base = {
    cardSettlementEvidenceMode,
    matchedPaymentFactStableIds: [...new Set(matchedPayment)].sort(),
    matchedPaymentReversalFactStableIds: [...new Set(matchedReversals)].sort(),
    matchedLoyaltyFactStableIds: [...new Set(matchedLoyalty)].sort(),
  };
  if (reasons.length > 0) {
    return {
      status: 'BLOCKED',
      classification: reasons[0].code,
      blockReasons: reasons,
      journal: null,
      ...base,
    };
  }
  if (lines.length === 0) {
    return {
      status: 'READY',
      classification: 'READY_NOOP',
      blockReasons: [],
      journal: null,
      ...base,
    };
  }
  const reversal = change.kind === 'REVERSAL';
  return {
    status: 'READY',
    classification: 'READY',
    blockReasons: [],
    journal: {
      idempotencyKey: `${reversal ? 'canonical-reversal' : 'canonical-adjustment'}:${change.factStableId}:v1`,
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.ORDER,
      sourceFactType: reversal
        ? CANONICAL_REVERSAL_SOURCE_FACT_TYPE
        : CANONICAL_ADJUSTMENT_SOURCE_FACT_TYPE,
      sourceFactStableId: change.factStableId,
      sourceFactVersion: change.version,
      storeStableId: change.storeStableId,
      occurredAt: change.occurredAt.toISOString(),
      currency: change.currency,
      memo: `Canonical ${change.kind.toLowerCase()} ${change.factStableId}`,
      lines,
    },
    ...base,
  };
};
