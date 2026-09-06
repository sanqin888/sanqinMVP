import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipService } from '../membership/membership.service';
import { OrderBenefitsReadService } from './order-benefits-read.service';

describe('OrderBenefitsReadService', () => {
  const userStableId = 'c2234567890abcdefghijklmn';
  const userDbId = '8a3d4c0e-4750-4f6a-9138-000000000010';

  let loyalty: {
    resolveUserIdByStableId: jest.Mock;
    getAvailablePaymentTender: jest.Mock;
    peekBalanceMicro: jest.Mock;
    maxRedeemableCentsFromBalance: jest.Mock;
  };
  let membership: {
    validateCouponForOrder: jest.Mock;
  };
  let service: OrderBenefitsReadService;

  beforeEach(() => {
    loyalty = {
      resolveUserIdByStableId: jest.fn().mockResolvedValue(userDbId),
      getAvailablePaymentTender: jest.fn().mockResolvedValue({
        pointsMicro: 125_000_000n,
        balanceCents: 875,
      }),
      peekBalanceMicro: jest.fn().mockResolvedValue(150_000_000n),
      maxRedeemableCentsFromBalance: jest.fn().mockResolvedValue(625),
    };
    membership = {
      validateCouponForOrder: jest.fn().mockResolvedValue(null),
    };
    service = new OrderBenefitsReadService(
      loyalty as unknown as LoyaltyService,
      membership as unknown as MembershipService,
    );
  });

  it('keeps member DB identity inside the Benefits owner when validating coupons', async () => {
    membership.validateCouponForOrder.mockResolvedValue({
      coupon: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        couponStableId: 'c3234567890abcdefghijklmn',
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: 2000,
        unlockedItemStableIds: [],
        stackingPolicy: 'STACKABLE',
      },
    });

    await expect(
      service.validateCouponForOrder({
        userStableId,
        couponStableId: 'c3234567890abcdefghijklmn',
      }),
    ).resolves.toEqual({
      coupon: {
        couponStableId: 'c3234567890abcdefghijklmn',
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: 2000,
        unlockedItemStableIds: [],
        stackingPolicy: 'STACKABLE',
      },
    });
    expect(membership.validateCouponForOrder).toHaveBeenCalledWith({
      userId: userDbId,
      couponStableId: 'c3234567890abcdefghijklmn',
    });
  });

  it('returns only order-facing tender availability from stable member identity', async () => {
    await expect(service.getAvailablePaymentTender(userStableId)).resolves.toEqual({
      balanceCents: 875,
      maxRedeemableCents: 625,
    });
    expect(loyalty.getAvailablePaymentTender).toHaveBeenCalledWith(userDbId);
    expect(loyalty.maxRedeemableCentsFromBalance).toHaveBeenCalledWith(
      125_000_000n,
    );
  });

  it('preserves loyalty-only eligibility against the raw account points balance', async () => {
    await expect(
      service.getLoyaltyOnlyRedeemCapacityCents(userStableId),
    ).resolves.toBe(625);
    expect(loyalty.peekBalanceMicro).toHaveBeenCalledWith(userDbId);
    expect(loyalty.getAvailablePaymentTender).not.toHaveBeenCalled();
    expect(loyalty.maxRedeemableCentsFromBalance).toHaveBeenCalledWith(
      150_000_000n,
    );
  });
});
