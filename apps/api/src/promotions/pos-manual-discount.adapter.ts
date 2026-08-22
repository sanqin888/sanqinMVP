import {
  resolvePromotionDiscountCents,
  type PromotionCandidate,
} from './promotion-engine';

export function toPosManualDiscountPromotionCandidate(params: {
  discountCents: number;
  subtotalCents: number;
}): PromotionCandidate | null {
  const subtotalCents = Math.max(0, Math.round(params.subtotalCents));
  const requestedDiscountCents = Math.max(0, Math.round(params.discountCents));
  if (subtotalCents <= 0 || requestedDiscountCents <= 0) return null;

  const discountCents = resolvePromotionDiscountCents({
    fixedDiscountCents: requestedDiscountCents,
    applicableSubtotalCents: subtotalCents,
  });

  return {
    promotionStableId: 'pos-manual-discount',
    source: 'POS_MANUAL_DISCOUNT',
    priority: 300,
    eligibility: { eligible: true, code: 'ELIGIBLE' },
    stacking: {
      group: 'POS_MANUAL_DISCOUNT',
      mode: 'STACKABLE',
    },
    benefit: {
      type: 'ORDER_DISCOUNT',
      applicableSubtotalCents: subtotalCents,
      discountCents,
    },
    snapshot: {
      requestedDiscountCents,
    },
  };
}
