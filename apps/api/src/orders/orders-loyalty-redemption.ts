export type LoyaltyRedemptionRequest = {
  pointsToRedeem?: number;
  redeemValueCents?: number;
};

export function resolveRequestedLoyaltyPoints(
  request: LoyaltyRedemptionRequest,
  redeemDollarPerPoint: number,
): number | undefined {
  if (typeof request.pointsToRedeem === 'number') {
    return request.pointsToRedeem;
  }

  if (
    typeof request.redeemValueCents === 'number' &&
    redeemDollarPerPoint > 0
  ) {
    return request.redeemValueCents / (redeemDollarPerPoint * 100);
  }

  return undefined;
}

export function resolveRequestedLoyaltyRedeemCents(
  requestedPoints: number,
  redeemDollarPerPoint: number,
): number {
  return Math.max(0, Math.round(requestedPoints * redeemDollarPerPoint * 100));
}
