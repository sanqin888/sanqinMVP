import { MembershipService } from './membership.service';

describe('MembershipService payment coupon reservation characterization', () => {
  const userStableId = 'cmember1';
  const couponStableId = 'ccoupon1';
  const userDbId = '11111111-1111-4111-8111-111111111111';
  const couponDbId = '22222222-2222-4222-8222-222222222222';
  const userCouponDbId = '33333333-3333-4333-8333-333333333333';

  function createHarness() {
    const userFindUnique = jest.fn().mockResolvedValue({ id: userDbId });
    const couponFindUnique = jest.fn().mockResolvedValue({
      id: couponDbId,
      couponStableId,
      userId: userDbId,
      code: 'SAVE1',
      title: 'Save $1',
      discountCents: 100,
      discountPercent: null,
      minSpendCents: null,
      expiresAt: null,
      issuedAt: new Date('2026-09-07T20:00:00.000Z'),
      usedAt: null,
      reservedAt: null,
      reservationAttemptId: null,
      reservationExpiresAt: null,
      orderId: null,
      source: null,
      campaign: null,
      fromTemplateId: null,
      unlockedItemStableIds: [],
      isFrozen: false,
      isActive: true,
      startsAt: null,
      endsAt: null,
      stackingPolicy: 'EXCLUSIVE',
    });
    const couponUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userCouponFindUnique = jest.fn().mockResolvedValue({
      id: userCouponDbId,
      userStableId,
      couponStableId,
      status: 'AVAILABLE',
      expiresAt: null,
      reservedAt: null,
      reservationAttemptId: null,
      reservationExpiresAt: null,
      redeemedAt: null,
      orderStableId: null,
      createdAt: new Date('2026-09-07T20:00:00.000Z'),
      updatedAt: new Date('2026-09-07T20:00:00.000Z'),
    });
    const userCouponUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      user: { findUnique: userFindUnique },
      coupon: {
        findUnique: couponFindUnique,
        updateMany: couponUpdateMany,
      },
      userCoupon: {
        findUnique: userCouponFindUnique,
        updateMany: userCouponUpdateMany,
      },
    };
    const transaction = jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const service = Object.create(MembershipService.prototype) as MembershipService;
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: { $transaction: transaction },
    });

    return {
      service,
      transaction,
      userFindUnique,
      couponFindUnique,
      couponUpdateMany,
      userCouponFindUnique,
      userCouponUpdateMany,
    };
  }

  it('reserves an assigned coupon by stable identities without accepting a UserCoupon DB id', async () => {
    const harness = createHarness();
    const expiresAt = new Date('2026-09-07T20:20:00.000Z');

    await harness.service.holdPaymentCoupons({
      attemptId: 'attempt-1',
      userStableId,
      couponStableId,
      reserveAssignedCoupon: true,
      expiresAt,
    });

    expect(harness.userFindUnique).toHaveBeenCalledWith({
      where: { userStableId },
      select: { id: true },
    });
    expect(harness.couponFindUnique).toHaveBeenCalledWith({
      where: { couponStableId },
    });
    expect(harness.userCouponFindUnique).toHaveBeenCalledWith({
      where: {
        userStableId_couponStableId: {
          userStableId,
          couponStableId,
        },
      },
    });
    expect(harness.userCouponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: userCouponDbId,
          userStableId,
          couponStableId,
          status: 'AVAILABLE',
        }) as unknown,
        data: expect.objectContaining({
          status: 'RESERVED',
          reservationAttemptId: 'attempt-1',
          reservationExpiresAt: expiresAt,
        }) as unknown,
      }),
    );
  });

  it('does not reserve the UserCoupon wrapper when the prepared business intent did not select it', async () => {
    const harness = createHarness();

    await harness.service.holdPaymentCoupons({
      attemptId: 'attempt-2',
      userStableId,
      couponStableId,
      reserveAssignedCoupon: false,
      expiresAt: new Date('2026-09-07T20:20:00.000Z'),
    });

    expect(harness.couponUpdateMany).toHaveBeenCalledTimes(1);
    expect(harness.userCouponFindUnique).not.toHaveBeenCalled();
    expect(harness.userCouponUpdateMany).not.toHaveBeenCalled();
  });
});
