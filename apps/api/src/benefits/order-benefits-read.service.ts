import { Injectable } from '@nestjs/common';

import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipService } from '../membership/membership.service';
import type {
  OrderAvailableTender,
  OrderBenefitsReaderPort,
  OrderCouponBenefit,
} from './contracts/order-benefits-read.contract';

@Injectable()
export class OrderBenefitsReadService implements OrderBenefitsReaderPort {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly membership: MembershipService,
  ) {}

  async validateCouponForOrder(input: {
    userStableId?: string;
    couponStableId?: string;
  }): Promise<{ coupon: OrderCouponBenefit } | null> {
    if (!input.couponStableId) return null;
    const userId = input.userStableId
      ? await this.loyalty.resolveUserIdByStableId(input.userStableId)
      : undefined;
    const couponInfo = await this.membership.validateCouponForOrder({
      userId,
      couponStableId: input.couponStableId,
    });
    if (!couponInfo?.coupon) return null;

    const coupon = couponInfo.coupon;
    return {
      coupon: {
        couponStableId: coupon.couponStableId,
        code: coupon.code,
        title: coupon.title,
        discountCents: coupon.discountCents,
        discountPercent: coupon.discountPercent,
        minSpendCents: coupon.minSpendCents,
        unlockedItemStableIds: coupon.unlockedItemStableIds,
        stackingPolicy: coupon.stackingPolicy,
      },
    };
  }

  async getAvailablePaymentTender(
    userStableId: string,
  ): Promise<OrderAvailableTender> {
    const userId = await this.loyalty.resolveUserIdByStableId(userStableId);
    const tender = await this.loyalty.getAvailablePaymentTender(userId);
    return {
      balanceCents: tender.balanceCents,
      maxRedeemableCents: await this.loyalty.maxRedeemableCentsFromBalance(
        tender.pointsMicro,
      ),
    };
  }

  async getLoyaltyOnlyRedeemCapacityCents(
    userStableId: string,
  ): Promise<number> {
    const userId = await this.loyalty.resolveUserIdByStableId(userStableId);
    const pointsMicro = await this.loyalty.peekBalanceMicro(userId);
    return this.loyalty.maxRedeemableCentsFromBalance(pointsMicro);
  }
}
