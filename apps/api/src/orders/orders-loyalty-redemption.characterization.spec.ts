import {
  resolveRequestedLoyaltyPoints,
  resolveRequestedLoyaltyRedeemCents,
} from './orders-loyalty-redemption';

describe('Orders loyalty redemption characterization', () => {
  it('preserves explicit points as the authoritative redemption request', () => {
    expect(
      resolveRequestedLoyaltyPoints(
        { pointsToRedeem: 3, redeemValueCents: 900 },
        0.5,
      ),
    ).toBe(3);
  });

  it('converts redeem cents to points with a non-default dollar-per-point rate', () => {
    expect(
      resolveRequestedLoyaltyPoints({ redeemValueCents: 250 }, 0.5),
    ).toBe(5);
  });

  it('preserves the existing no-conversion behavior for a non-positive rate', () => {
    expect(resolveRequestedLoyaltyPoints({ redeemValueCents: 250 }, 0)).toBe(
      undefined,
    );
  });

  it('preserves cent rounding for a non-default dollar-per-point rate', () => {
    expect(resolveRequestedLoyaltyRedeemCents(1.2345, 0.5)).toBe(62);
  });
});
