export const CLOVER_CARD_SURCHARGE_RATE = 2.4;
const CLOVER_SURCHARGE_TOLERANCE_CENTS = 1;

export type ChargeAmountReconcileResult = {
  surchargeCents: number;
  mismatchBeyondTolerance: boolean;
  mode:
    | 'provider'
    | 'fallback_rate'
    | 'fallback_rate_on_base'
    | 'fallback_actual_diff';
  expectedChargeByRateCents: number;
};

export function reconcileChargeAmount(params: {
  intentAmountCents: number;
  chargedAmountCents: number;
  surchargeCents?: number;
  allowRateFallbackWhenEqual?: boolean;
}): ChargeAmountReconcileResult {
  const {
    intentAmountCents,
    chargedAmountCents,
    surchargeCents,
    allowRateFallbackWhenEqual,
  } = params;
  const normalizedSurcharge = Math.max(0, Math.round(surchargeCents ?? 0));
  const surchargeByRate = Math.round(
    intentAmountCents * (CLOVER_CARD_SURCHARGE_RATE / 100),
  );

  if (
    allowRateFallbackWhenEqual &&
    normalizedSurcharge <= 0 &&
    chargedAmountCents === intentAmountCents &&
    surchargeByRate > 0
  ) {
    return {
      surchargeCents: surchargeByRate,
      mismatchBeyondTolerance: false,
      mode: 'fallback_rate_on_base',
      expectedChargeByRateCents: intentAmountCents + surchargeByRate,
    };
  }

  if (
    normalizedSurcharge > 0 &&
    [
      chargedAmountCents,
      chargedAmountCents - normalizedSurcharge,
      chargedAmountCents + normalizedSurcharge,
    ].includes(intentAmountCents)
  ) {
    return {
      surchargeCents: normalizedSurcharge,
      mismatchBeyondTolerance: false,
      mode: 'provider',
      expectedChargeByRateCents: intentAmountCents + surchargeByRate,
    };
  }

  const expectedChargedByRate = intentAmountCents + surchargeByRate;
  const fallbackSurcharge = Math.max(0, chargedAmountCents - intentAmountCents);
  const isWithinTolerance =
    Math.abs(chargedAmountCents - expectedChargedByRate) <=
      CLOVER_SURCHARGE_TOLERANCE_CENTS &&
    Math.abs(fallbackSurcharge - surchargeByRate) <=
      CLOVER_SURCHARGE_TOLERANCE_CENTS;

  return {
    surchargeCents: fallbackSurcharge,
    mismatchBeyondTolerance: !isWithinTolerance,
    mode: isWithinTolerance ? 'fallback_rate' : 'fallback_actual_diff',
    expectedChargeByRateCents: expectedChargedByRate,
  };
}
