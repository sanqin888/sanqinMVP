// apps/api/src/loyalty/loyalty.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  LoyaltyEntryType,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { CouponProgramTriggerService } from '../coupons/coupon-program-trigger.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePromotionLoyaltyMultiplier } from '../promotions/promotion-engine';
import type {
  LoyaltyPolicyReaderPort,
  LoyaltyPolicySettings,
  LoyaltyPolicySnapshot,
  LoyaltyTier,
} from './loyalty-policy.contract';
import { compareLoyaltyPolicyPersistence } from './loyalty-policy-parity';
import { normalizeLoyaltyPolicy } from './loyalty-policy';

const MICRO_PER_POINT = 1_000_000n; // 1 pt = 1e6 micro-pts，避免小数误差

const LEDGER_SOURCE_ORDER = 'ORDER';
const LEDGER_SOURCE_PAYMENT_BALANCE = 'PAYMENT_BALANCE';
const LEDGER_SOURCE_FULL_REFUND = 'FULL_REFUND';
const LEDGER_SOURCE_FULL_REFUND_BALANCE = 'FULL_REFUND_BALANCE';
const ledgerSourceAmend = (amendStableId: string) => `AMEND:${amendStableId}`;
const LEDGER_SOURCE_TOPUP = 'TOPUP';
const LEDGER_SOURCE_MANUAL = 'MANUAL';
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const LOYALTY_POLICY_SELECT = {
  earnPtPerDollar: true,
  redeemDollarPerPoint: true,
  referralPtPerDollar: true,
  tierMultiplierBronze: true,
  tierMultiplierSilver: true,
  tierMultiplierGold: true,
  tierMultiplierPlatinum: true,
  tierThresholdSilver: true,
  tierThresholdGold: true,
  tierThresholdPlatinum: true,
} as const;

type Tier = LoyaltyTier;
type LoyaltyConfig = LoyaltyPolicySnapshot;

type OrderForLoyaltySettlement = Pick<
  Prisma.OrderGetPayload<Record<string, never>>,
  | 'id'
  | 'userId'
  | 'subtotalCents'
  | 'subtotalAfterDiscountCents'
  | 'loyaltyRedeemCents'
  | 'promotionSnapshot'
>;

function computeTierFromLifetime(
  lifetimeSpendCents: number,
  thresholds: LoyaltyConfig['tierThresholdCents'],
): Tier {
  if (lifetimeSpendCents >= thresholds.PLATINUM) return 'PLATINUM';
  if (lifetimeSpendCents >= thresholds.GOLD) return 'GOLD';
  if (lifetimeSpendCents >= thresholds.SILVER) return 'SILVER';
  return 'BRONZE';
}

function normalizeLoyaltyCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function computeEligibleSpendCents(params: {
  subtotalCents: number;
  redeemValueCents: number;
  balanceUsedCents: number;
}): {
  earnCents: number;
  tierCents: number;
  referralCents: number;
} {
  const subtotalCents = normalizeLoyaltyCents(params.subtotalCents);
  const redeemValueCents = normalizeLoyaltyCents(params.redeemValueCents);
  const balanceUsedCents = normalizeLoyaltyCents(params.balanceUsedCents);

  const earnCents = Math.max(0, subtotalCents - redeemValueCents);
  const tierCents = Math.max(0, earnCents - balanceUsedCents);

  return {
    earnCents,
    tierCents,
    referralCents: tierCents,
  };
}

export function computeTierEligibleSpendFromNetCents(
  netSubtotalCents: number,
  balanceUsedCents: number,
): number {
  return Math.max(
    0,
    normalizeLoyaltyCents(netSubtotalCents) -
      normalizeLoyaltyCents(balanceUsedCents),
  );
}

const TIER_RANK: Record<Tier, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

function isTierUpgrade(before: Tier, after: Tier): boolean {
  return TIER_RANK[after] > TIER_RANK[before];
}

function toMicroPoints(points: number): bigint {
  // 四舍五入到 micro
  return BigInt(Math.round(points * Number(MICRO_PER_POINT)));
}

function centsFromDollarMicro(micro: bigint): number {
  return Number((micro * 100n) / MICRO_PER_POINT);
}

function dollarsFromPointsMicro(
  micro: bigint,
  redeemDollarPerPoint: number,
): number {
  // 以“1 点 = redeemDollarPerPoint 美元”换算
  const pts = Number(micro) / Number(MICRO_PER_POINT);
  return pts * redeemDollarPerPoint;
}

function buildIdempotencyChildKey(base: string, suffix: string): string {
  const candidate = `${base}:${suffix}`;
  if (candidate.length <= IDEMPOTENCY_KEY_MAX_LENGTH) return candidate;

  const hash = createHash('sha256')
    .update(candidate)
    .digest('hex')
    .slice(0, 12);
  const maxBaseLength =
    IDEMPOTENCY_KEY_MAX_LENGTH - suffix.length - hash.length - 2;
  const baseSlice = base.slice(0, Math.max(1, maxBaseLength));
  return `${baseSlice}:${suffix}-${hash}`;
}

@Injectable()
export class LoyaltyService implements LoyaltyPolicyReaderPort {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly couponTriggerService: CouponProgramTriggerService,
  ) {}

  private observePolicyParity(
    context: string,
    brandConfig: LoyaltyPolicySettings | null,
    loyaltyProgramPolicy: LoyaltyPolicySettings | null,
  ): void {
    const differences = compareLoyaltyPolicyPersistence(
      brandConfig,
      loyaltyProgramPolicy,
    );
    if (differences.length === 0) return;

    this.logger.warn(
      JSON.stringify({
        event: 'loyalty_policy_shadow_mismatch',
        compatId: 'benefits.business-config-loyalty-policy.v1',
        context,
        differences,
      }),
    );
  }

  // @compat benefits.business-config-loyalty-policy.v1
  async getLoyaltyPolicySnapshot(): Promise<LoyaltyPolicySnapshot> {
    const loyaltyProgramPolicy =
      await this.prisma.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SELECT,
      });
    const brandConfig = await this.prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: LOYALTY_POLICY_SELECT,
    });
    this.observePolicyParity('runtime-read', brandConfig, loyaltyProgramPolicy);
    return normalizeLoyaltyPolicy(loyaltyProgramPolicy);
  }

  private async getLoyaltyPolicySnapshotWithTx(
    tx: Prisma.TransactionClient,
  ): Promise<LoyaltyPolicySnapshot> {
    const loyaltyProgramPolicy = await tx.loyaltyProgramPolicy.findUnique({
      where: { id: 1 },
      select: LOYALTY_POLICY_SELECT,
    });
    const brandConfig = await tx.brandConfig.findUnique({
      where: { id: 1 },
      select: LOYALTY_POLICY_SELECT,
    });
    this.observePolicyParity(
      'transaction-read',
      brandConfig,
      loyaltyProgramPolicy,
    );
    return normalizeLoyaltyPolicy(loyaltyProgramPolicy);
  }

  async getMembershipProgramRules() {
    const config = await this.getLoyaltyPolicySnapshot();
    const tierRules = (['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const).map(
      (tier) => {
        const thresholdCents =
          tier === 'BRONZE' ? 0 : config.tierThresholdCents[tier];
        const earnPtPerDollar =
          config.earnPtPerDollar * config.tierMultipliers[tier];

        return {
          tier,
          thresholdCents,
          multiplier: config.tierMultipliers[tier],
          earnPtPerDollar,
          earnValueRatePercent:
            earnPtPerDollar * config.redeemDollarPerPoint * 100,
        };
      },
    );

    return {
      earnPtPerDollar: config.earnPtPerDollar,
      redeemDollarPerPoint: config.redeemDollarPerPoint,
      referralPtPerDollar: config.referralPtPerDollar,
      referralValueRatePercent:
        config.referralPtPerDollar * config.redeemDollarPerPoint * 100,
      tierRules,
    };
  }

  // ✅ 新增：stableId -> 内部 UUID userId
  async resolveUserIdByStableId(userStableId: string): Promise<string> {
    const stable = typeof userStableId === 'string' ? userStableId.trim() : '';
    if (!stable) {
      throw new BadRequestException('userStableId is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { userStableId: stable },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('member not found');
    }

    return user.id;
  }

  private async resolveUserIdByStableIdWithTx(
    tx: Prisma.TransactionClient,
    userStableId: string,
  ): Promise<string> {
    const stable = typeof userStableId === 'string' ? userStableId.trim() : '';
    if (!stable) throw new BadRequestException('userStableId is required');

    const user = await tx.user.findUnique({
      where: { userStableId: stable },
      select: { id: true },
    });

    if (!user) throw new BadRequestException('member not found');
    return user.id;
  }

  /**
   * 确保有账户（无则创建为 BRONZE 0pt，lifetimeSpendCents=0）——用于事务外场景
   */
  async ensureAccount(userId: string) {
    if (!userId) {
      throw new Error('userId is required');
    }

    return this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: {
        userId,
        pointsMicro: BigInt(0),
        balanceMicro: BigInt(0),
        tier: 'BRONZE',
        lifetimeSpendCents: 0,
      },
      update: {},
      select: {
        id: true,
        userId: true,
        pointsMicro: true,
        balanceMicro: true,
        tier: true,
        lifetimeSpendCents: true,
      },
    });
  }

  /**
   * 事务内版本：用传入的 tx，避免在事务中再用全局 prisma
   */
  private async ensureAccountWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    if (!userId) {
      throw new Error('userId is required');
    }

    return tx.loyaltyAccount.upsert({
      where: { userId },
      create: {
        userId,
        pointsMicro: BigInt(0),
        balanceMicro: BigInt(0),
        tier: 'BRONZE',
        lifetimeSpendCents: 0,
      },
      update: {},
      select: {
        id: true,
        userId: true,
        pointsMicro: true,
        balanceMicro: true,
        tier: true,
        lifetimeSpendCents: true,
      },
    });
  }

  async getAvailablePaymentTender(userId: string): Promise<{
    pointsMicro: bigint;
    balanceCents: number;
  }> {
    if (!userId) return { pointsMicro: 0n, balanceCents: 0 };

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { id: true, pointsMicro: true, balanceMicro: true },
    });
    if (!account) return { pointsMicro: 0n, balanceCents: 0 };

    const held = await this.prisma.loyaltyTenderReservation.aggregate({
      where: { accountId: account.id, status: 'HELD' },
      _sum: { pointsMicro: true, balanceMicro: true },
    });
    const heldPointsMicro = held._sum.pointsMicro ?? 0n;
    const heldBalanceMicro = held._sum.balanceMicro ?? 0n;
    const pointsMicro =
      account.pointsMicro > heldPointsMicro
        ? account.pointsMicro - heldPointsMicro
        : 0n;
    const balanceMicro =
      account.balanceMicro > heldBalanceMicro
        ? account.balanceMicro - heldBalanceMicro
        : 0n;

    return {
      pointsMicro,
      balanceCents: centsFromDollarMicro(balanceMicro),
    };
  }

  async holdPaymentTender(params: {
    attemptId: string;
    userStableId?: string;
    pointsValueCents: number;
    balanceCents: number;
    expiresAt: Date;
  }): Promise<{
    reservationId: string | null;
    userId: string | null;
    pointsValueCents: number;
    balanceCents: number;
  }> {
    const attemptId = params.attemptId.trim();
    const pointsValueCents = normalizeLoyaltyCents(params.pointsValueCents);
    const balanceCents = normalizeLoyaltyCents(params.balanceCents);
    if (!attemptId) {
      throw new BadRequestException('payment attemptId is required');
    }
    if (pointsValueCents === 0 && balanceCents === 0) {
      return {
        reservationId: null,
        userId: null,
        pointsValueCents: 0,
        balanceCents: 0,
      };
    }
    if (!params.userStableId?.trim()) {
      throw new BadRequestException(
        'member is required for points or stored balance payment',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const userId = await this.resolveUserIdByStableIdWithTx(
        tx,
        params.userStableId!,
      );
      const account = await this.ensureAccountWithTx(tx, userId);
      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${account.id}::uuid
        FOR UPDATE
      `;
      const lockedAccount = await tx.loyaltyAccount.findUnique({
        where: { id: account.id },
      });
      if (!lockedAccount) {
        throw new BadRequestException('loyalty account not found');
      }

      const existing = await tx.loyaltyTenderReservation.findUnique({
        where: { attemptId },
      });
      const loyaltyConfig = await this.getLoyaltyPolicySnapshotWithTx(tx);
      const pointsMicro =
        pointsValueCents > 0
          ? toMicroPoints(
              pointsValueCents / 100 / loyaltyConfig.redeemDollarPerPoint,
            )
          : 0n;
      const balanceMicro =
        balanceCents > 0 ? toMicroPoints(balanceCents / 100) : 0n;

      if (existing) {
        if (
          existing.userId !== userId ||
          existing.pointsMicro !== pointsMicro ||
          existing.pointsValueCents !== pointsValueCents ||
          existing.balanceMicro !== balanceMicro ||
          existing.balanceCents !== balanceCents ||
          existing.status === 'RELEASED'
        ) {
          throw new BadRequestException(
            'payment tender reservation identity was reused with different facts',
          );
        }
        return {
          reservationId: existing.id,
          userId,
          pointsValueCents: existing.pointsValueCents,
          balanceCents: existing.balanceCents,
        };
      }

      const held = await tx.loyaltyTenderReservation.aggregate({
        where: { accountId: lockedAccount.id, status: 'HELD' },
        _sum: { pointsMicro: true, balanceMicro: true },
      });
      const availablePointsMicro =
        lockedAccount.pointsMicro - (held._sum.pointsMicro ?? 0n);
      const availableBalanceMicro =
        lockedAccount.balanceMicro - (held._sum.balanceMicro ?? 0n);

      if (pointsMicro > availablePointsMicro) {
        throw new BadRequestException(
          'insufficient loyalty points after active payment holds',
        );
      }
      if (balanceMicro > availableBalanceMicro) {
        throw new BadRequestException(
          'insufficient store balance after active payment holds',
        );
      }

      const reservation = await tx.loyaltyTenderReservation.create({
        data: {
          attemptId,
          accountId: account.id,
          userId,
          pointsMicro,
          pointsValueCents,
          balanceMicro,
          balanceCents,
          expiresAt: params.expiresAt,
        },
      });

      return {
        reservationId: reservation.id,
        userId,
        pointsValueCents,
        balanceCents,
      };
    });
  }

  async commitPaymentTenderForOrder(params: {
    tx: Prisma.TransactionClient;
    attemptId: string;
    orderId: string;
  }): Promise<{ pointsValueCents: number; balanceCents: number }> {
    const { tx, orderId } = params;
    const attemptId = params.attemptId.trim();
    if (!attemptId) {
      throw new BadRequestException('payment attemptId is required');
    }

    await tx.$queryRaw`
      SELECT id
      FROM "LoyaltyTenderReservation"
      WHERE "attemptId" = ${attemptId}
      FOR UPDATE
    `;
    const reservation = await tx.loyaltyTenderReservation.findUnique({
      where: { attemptId },
    });
    if (!reservation) {
      return { pointsValueCents: 0, balanceCents: 0 };
    }
    if (reservation.status === 'COMMITTED') {
      if (reservation.orderId !== orderId) {
        throw new BadRequestException(
          'payment tender reservation is already committed to another order',
        );
      }
      return {
        pointsValueCents: reservation.pointsValueCents,
        balanceCents: reservation.balanceCents,
      };
    }
    if (reservation.status === 'RELEASED') {
      throw new BadRequestException('payment tender reservation was released');
    }

    const account = await tx.loyaltyAccount.findUnique({
      where: { id: reservation.accountId },
    });
    if (!account) {
      throw new BadRequestException('loyalty account not found');
    }
    await tx.$queryRaw`
      SELECT id
      FROM "LoyaltyAccount"
      WHERE id = ${reservation.accountId}::uuid
      FOR UPDATE
    `;
    const lockedAccount = await tx.loyaltyAccount.findUnique({
      where: { id: reservation.accountId },
    });
    if (!lockedAccount) {
      throw new BadRequestException('loyalty account not found');
    }
    if (lockedAccount.pointsMicro < reservation.pointsMicro) {
      throw new BadRequestException(
        'reserved loyalty points are no longer available',
      );
    }
    if (lockedAccount.balanceMicro < reservation.balanceMicro) {
      throw new BadRequestException(
        'reserved store balance is no longer available',
      );
    }

    const newPointsMicro = lockedAccount.pointsMicro - reservation.pointsMicro;
    const newBalanceMicro =
      lockedAccount.balanceMicro - reservation.balanceMicro;

    if (reservation.pointsMicro > 0n) {
      await tx.loyaltyLedger.create({
        data: {
          accountId: reservation.accountId,
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          target: 'POINTS',
          sourceKey: LEDGER_SOURCE_ORDER,
          deltaMicro: -reservation.pointsMicro,
          balanceAfterMicro: newPointsMicro,
          note: `payment hold committed $${(
            reservation.pointsValueCents / 100
          ).toFixed(2)}`,
        },
      });
    }
    if (reservation.balanceMicro > 0n) {
      await tx.loyaltyLedger.create({
        data: {
          accountId: reservation.accountId,
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          target: 'BALANCE',
          sourceKey: LEDGER_SOURCE_PAYMENT_BALANCE,
          deltaMicro: -reservation.balanceMicro,
          balanceAfterMicro: newBalanceMicro,
          note: `payment hold committed balance $${(
            reservation.balanceCents / 100
          ).toFixed(2)}`,
        },
      });
    }

    await tx.loyaltyAccount.update({
      where: { id: reservation.accountId },
      data: {
        pointsMicro: newPointsMicro,
        balanceMicro: newBalanceMicro,
      },
    });
    await tx.loyaltyTenderReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'COMMITTED',
        orderId,
        committedAt: new Date(),
      },
    });

    return {
      pointsValueCents: reservation.pointsValueCents,
      balanceCents: reservation.balanceCents,
    };
  }

  async releasePaymentTender(attemptIdRaw: string): Promise<void> {
    const attemptId = attemptIdRaw.trim();
    if (!attemptId) return;
    await this.prisma.loyaltyTenderReservation.updateMany({
      where: { attemptId, status: 'HELD' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
  }

  async grantPointsForOrder(
    order: OrderForLoyaltySettlement,
  ): Promise<{ pointsEarned: number }> {
    const existingEarn = await this.prisma.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId: order.id,
          type: LoyaltyEntryType.EARN_ON_PURCHASE,
          sourceKey: LEDGER_SOURCE_ORDER,
        },
      },
      select: { deltaMicro: true },
    });

    if (existingEarn) {
      return {
        pointsEarned: Number(existingEarn.deltaMicro) / Number(MICRO_PER_POINT),
      };
    }

    const redeemValueCents = order.loyaltyRedeemCents ?? 0;
    const subtotalForRewards =
      typeof order.subtotalAfterDiscountCents === 'number'
        ? order.subtotalAfterDiscountCents + redeemValueCents
        : (order.subtotalCents ?? 0);

    await this.settleOnPaid({
      orderId: order.id,
      userId: order.userId ?? undefined,
      subtotalCents: subtotalForRewards,
      redeemValueCents,
      earnMultiplier: resolvePromotionLoyaltyMultiplier(
        order.promotionSnapshot,
      ),
    });

    const earnedLedger = await this.prisma.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId: order.id,
          type: LoyaltyEntryType.EARN_ON_PURCHASE,
          sourceKey: LEDGER_SOURCE_ORDER,
        },
      },
      select: { deltaMicro: true },
    });

    return {
      pointsEarned: earnedLedger
        ? Number(earnedLedger.deltaMicro) / Number(MICRO_PER_POINT)
        : 0,
    };
  }

  /** 只读：返回当前余额 micro */
  async peekBalanceMicro(userId: string): Promise<bigint> {
    const acc = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { pointsMicro: true },
    });
    return acc?.pointsMicro ?? BigInt(0);
  }

  /**
   * 结算：订单已支付 → 扣减抵扣积分 + 发放赚取积分 + 更新累计消费 + 自动升级 + 推荐人奖励（幂等）
   *
   * subtotalCents: 订单商品原始小计（税前、未扣积分）
   * redeemValueCents: 本单用积分抵掉的“现金价值”（分）
   */
  async settleOnPaid(params: {
    orderId: string;
    userId?: string;
    subtotalCents: number; // 折后商品小计（税前、未扣积分）
    redeemValueCents: number; // 本单抵扣掉的“现金价值”（分）
    tier?: Tier; // 可选：外部传入，自定义当前等级
    earnMultiplier?: number;
  }) {
    const {
      orderId,
      userId,
      subtotalCents,
      redeemValueCents,
      tier,
      earnMultiplier = 1,
    } = params;
    if (!userId) return; // 匿名单不处理
    const loyaltyConfig = await this.getLoyaltyPolicySnapshot();

    const settleResult = await this.prisma.$transaction(async (tx) => {
      const accRaw = await this.ensureAccountWithTx(tx, userId);

      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${accRaw.id}::uuid
        FOR UPDATE
      `;

      let balance = accRaw.pointsMicro;
      let lifetimeSpendCents = accRaw.lifetimeSpendCents ?? 0;

      // 实际消费额（不含积分抵扣）
      const netSubtotalCents = Math.max(0, subtotalCents - redeemValueCents);

      // 2) 抵扣
      const requestedRedeemMicro = toMicroPoints(
        redeemValueCents / 100 / loyaltyConfig.redeemDollarPerPoint,
      );

      if (requestedRedeemMicro > 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type_sourceKey: {
              orderId,
              type: LoyaltyEntryType.REDEEM_ON_ORDER,
              sourceKey: LEDGER_SOURCE_ORDER,
            },
          },
          select: { id: true },
        });

        if (!existed) {
          const willDeduct =
            requestedRedeemMicro > balance ? balance : requestedRedeemMicro;
          const newBal = balance - willDeduct;

          await tx.loyaltyLedger.create({
            data: {
              accountId: accRaw.id,
              orderId,
              type: LoyaltyEntryType.REDEEM_ON_ORDER,
              sourceKey: LEDGER_SOURCE_ORDER,
              deltaMicro: -willDeduct,
              balanceAfterMicro: newBal,
              note: `redeem $${(redeemValueCents / 100).toFixed(2)}`,
            },
          });

          balance = newBal;
        }
      }
      // --- 查询本单使用了多少储值余额 ---
      // 我们通过查找 Ledger 中 target='BALANCE' 的记录来获知余额扣除额
      const balanceLedger = await tx.loyaltyLedger.findFirst({
        where: {
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          target: 'BALANCE', // 明确是余额扣除
        },
        select: { deltaMicro: true },
      });

      // deltaMicro 是负数，取反转正。如果没有记录则为 0。
      const balanceUsedMicro = balanceLedger ? -balanceLedger.deltaMicro : 0n;
      const balanceUsedCents = Number(balanceUsedMicro) / 10000;

      // 储值余额在充值时已经计入 lifetimeSpendCents：
      // - 会员本人赚取消费积分：储值余额与现金/银行卡一样，只扣积分抵扣。
      // - 等级累计消费：还要扣除本单使用的储值余额，避免充值 + 消费重复累计。
      // - 推荐奖励：同样扣储值余额，避免推荐人在充值和后续消费时重复获奖。
      const spendBases = computeEligibleSpendCents({
        subtotalCents,
        redeemValueCents,
        balanceUsedCents,
      });
      const netSubtotalForUserEarn = spendBases.earnCents;
      const netSubtotalForTier = spendBases.tierCents;
      const netSubtotalForReferral = spendBases.referralCents;

      // 3) 赚取积分
      const accountTier: Tier = tier ?? (accRaw.tier as Tier);

      const promotionEarnMultiplier =
        Number.isFinite(earnMultiplier) && earnMultiplier >= 1
          ? Math.min(10, earnMultiplier)
          : 1;
      const earnedPts =
        (netSubtotalForUserEarn / 100) *
        loyaltyConfig.earnPtPerDollar *
        loyaltyConfig.tierMultipliers[accountTier] *
        promotionEarnMultiplier;

      const earnedMicro = toMicroPoints(earnedPts);

      if (earnedMicro > 0n) {
        const existedEarn = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type_sourceKey: {
              orderId,
              type: LoyaltyEntryType.EARN_ON_PURCHASE,
              sourceKey: LEDGER_SOURCE_ORDER,
            },
          },
          select: { id: true },
        });

        if (!existedEarn) {
          const newBal = balance + earnedMicro;

          await tx.loyaltyLedger.create({
            data: {
              accountId: accRaw.id,
              orderId,
              type: LoyaltyEntryType.EARN_ON_PURCHASE,
              sourceKey: LEDGER_SOURCE_ORDER,
              deltaMicro: earnedMicro,
              balanceAfterMicro: newBal,
              note: `earn on $${(netSubtotalCents / 100).toFixed(2)} @${(
                loyaltyConfig.earnPtPerDollar *
                loyaltyConfig.tierMultipliers[accountTier]
              ).toFixed(4)} pt/$`,
            },
          });

          balance = newBal;
        }
      }

      // 4) 累加累计实际消费（储值本金已在充值时累计，这里只加非储值部分）
      lifetimeSpendCents += netSubtotalForTier;

      // 5) 更新等级
      const newTier = computeTierFromLifetime(
        lifetimeSpendCents,
        loyaltyConfig.tierThresholdCents,
      );

      // 6) 回写账户
      await tx.loyaltyAccount.update({
        where: { id: accRaw.id },
        data: {
          pointsMicro: balance,
          tier: newTier,
          lifetimeSpendCents,
        },
      });

      // 7) 推荐人奖励（幂等）
      if (loyaltyConfig.referralPtPerDollar > 0 && netSubtotalForReferral > 0) {
        const userRow = await tx.user.findUnique({
          where: { id: userId },
          select: { referredByUserId: true },
        });

        const refUserId = userRow?.referredByUserId;

        if (refUserId && refUserId !== userId) {
          const existedReferral = await tx.loyaltyLedger.findUnique({
            where: {
              orderId_type_sourceKey: {
                orderId,
                type: LoyaltyEntryType.REFERRAL_BONUS,
                sourceKey: LEDGER_SOURCE_ORDER,
              },
            },
            select: { id: true },
          });

          if (!existedReferral) {
            const referralPts =
              (netSubtotalForReferral / 100) *
              loyaltyConfig.referralPtPerDollar;
            const referralMicro = toMicroPoints(referralPts);

            if (referralMicro > 0n) {
              const refAcc = await this.ensureAccountWithTx(tx, refUserId);

              await tx.$queryRaw`
                SELECT id
                FROM "LoyaltyAccount"
                WHERE id = ${refAcc.id}::uuid
                FOR UPDATE
              `;

              const refNewBal = refAcc.pointsMicro + referralMicro;

              await tx.loyaltyLedger.create({
                data: {
                  accountId: refAcc.id,
                  orderId,
                  type: LoyaltyEntryType.REFERRAL_BONUS,
                  sourceKey: LEDGER_SOURCE_ORDER,
                  deltaMicro: referralMicro,
                  balanceAfterMicro: refNewBal,
                  note: `referral bonus on $${(netSubtotalCents / 100).toFixed(
                    2,
                  )} from ${userId}`,
                },
              });

              await tx.loyaltyAccount.update({
                where: { id: refAcc.id },
                data: {
                  pointsMicro: refNewBal,
                },
              });
            }
          }
        }
      }

      return {
        tierBefore: accRaw.tier as Tier,
        tierAfter: newTier,
      };
    });

    if (isTierUpgrade(settleResult.tierBefore, settleResult.tierAfter)) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await this.couponTriggerService.issueProgramsForUser(
          'TIER_UPGRADE',
          user,
        );
      }
    }
  }

  async getSettledBalancePaymentCentsForOrder(
    orderId: string,
  ): Promise<number> {
    const settled = await this.prisma.loyaltyLedger.aggregate({
      where: {
        orderId,
        type: LoyaltyEntryType.REDEEM_ON_ORDER,
        target: 'BALANCE',
        deltaMicro: { lt: 0n },
      },
      _sum: { deltaMicro: true },
    });
    const settledMicro = -(settled._sum.deltaMicro ?? 0n);
    return Number(settledMicro / 10_000n);
  }

  // ✅ 新增方法：扣除储值余额
  async deductBalanceForOrder(params: {
    tx: Prisma.TransactionClient;
    userId: string;
    orderId: string;
    amountCents: number;
  }): Promise<void> {
    const { tx, userId, orderId, amountCents } = params;
    if (amountCents <= 0) return;

    const account = await this.ensureAccountWithTx(tx, userId);

    // 锁行
    await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE id = ${account.id}::uuid FOR UPDATE`;

    // 转换金额：1 cent = 0.01 dollar. 假设 balanceMicro 存储逻辑是 1 unit = 1e6 micro.
    // 需要确认 balanceMicro 的单位。在 applyTopup 中：toMicroPoints(cents / 100).
    // 所以 balanceMicro 是以“元”为单位的 micro 值 (1e6 micro = 1 dollar).
    const deductMicro = toMicroPoints(amountCents / 100);
    const held = await tx.loyaltyTenderReservation.aggregate({
      where: { accountId: account.id, status: 'HELD' },
      _sum: { balanceMicro: true },
    });
    const availableBalanceMicro =
      account.balanceMicro > (held._sum.balanceMicro ?? 0n)
        ? account.balanceMicro - (held._sum.balanceMicro ?? 0n)
        : 0n;

    if (availableBalanceMicro < deductMicro) {
      throw new BadRequestException(`Insufficient store balance.`);
    }

    const newBalance = account.balanceMicro - deductMicro;
    const sk = LEDGER_SOURCE_PAYMENT_BALANCE;

    // 储值余额使用独立 sourceKey，允许与同一订单的积分抵扣账本并存。
    // 检查是否已经扣过（幂等）
    const existed = await tx.loyaltyLedger.findFirst({
      where: {
        orderId,
        type: LoyaltyEntryType.REDEEM_ON_ORDER, // 复用类型，通过 target 区分
        target: 'BALANCE',
        sourceKey: sk,
      },
    });

    if (!existed) {
      await tx.loyaltyLedger.create({
        data: {
          accountId: account.id,
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          target: 'BALANCE', // ✅ 明确标记扣除的是余额
          sourceKey: sk,
          deltaMicro: -deductMicro,
          balanceAfterMicro: newBalance,
          note: `balance payment $${(amountCents / 100).toFixed(2)}`,
        },
      });

      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { balanceMicro: newBalance },
      });
    }
  }

  /**
   * 退款：冲回【自己】赚取、返还抵扣 + 回退累计消费 & 等级 + 冲回推荐人奖励（幂等）
   */
  async rollbackOnRefund(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        subtotalCents: true,
        subtotalAfterDiscountCents: true,
        couponDiscountCents: true,
        loyaltyRedeemCents: true,
      },
    });
    if (!order?.userId) return;
    const loyaltyConfig = await this.getLoyaltyPolicySnapshot();

    const netSubtotalCents = Math.max(
      0,
      typeof order.subtotalAfterDiscountCents === 'number'
        ? order.subtotalAfterDiscountCents
        : (order.subtotalCents ?? 0) -
            (order.couponDiscountCents ?? 0) -
            (order.loyaltyRedeemCents ?? 0),
    );

    await this.prisma.$transaction(async (tx) => {
      const acc = await this.ensureAccountWithTx(tx, order.userId!);

      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${acc.id}::uuid
        FOR UPDATE
      `;

      let pointsBalance = acc.pointsMicro; // 积分余额
      let storeBalance = acc.balanceMicro; // 储值余额
      let lifetimeSpendCents = acc.lifetimeSpendCents ?? 0;
      let shouldAdjustLifetime = false;

      // 1) 反冲自己赚取
      const earn = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.EARN_ON_PURCHASE,
            sourceKey: LEDGER_SOURCE_ORDER,
          },
        },
        select: { deltaMicro: true },
      });

      if (earn && earn.deltaMicro > 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type_sourceKey: {
              orderId,
              type: LoyaltyEntryType.REFUND_REVERSE_EARN,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
            },
          },
          select: { id: true },
        });

        if (!existed) {
          pointsBalance -= earn.deltaMicro; // 更新本地变量
          shouldAdjustLifetime = true;
          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.REFUND_REVERSE_EARN,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
              deltaMicro: -earn.deltaMicro,
              balanceAfterMicro: pointsBalance, // ✅ 使用正确的 pointsBalance
              note: 'reverse earned on refund',
            },
          });
        }
      }

      // 2) 退回抵扣积分
      const redeemPointsRecord = await tx.loyaltyLedger.findFirst({
        where: {
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          sourceKey: LEDGER_SOURCE_ORDER,
          target: 'POINTS', // ✅ 明确只找积分抵扣
        },
      });

      if (redeemPointsRecord && redeemPointsRecord.deltaMicro < 0n) {
        const existedPointsRefund = await tx.loyaltyLedger.findFirst({
          where: {
            orderId,
            type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
            sourceKey: LEDGER_SOURCE_FULL_REFUND,
            target: 'POINTS',
          },
        });

        if (!existedPointsRefund) {
          const back = -redeemPointsRecord.deltaMicro;
          pointsBalance += back;

          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
              target: 'POINTS',
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
              deltaMicro: back,
              balanceAfterMicro: pointsBalance,
              note: 'return redeemed points on refund',
            },
          });
        }
      }

      // ✅ 3) [新增] 退回使用的【储值余额】 (REDEEM - BALANCE)
      const redeemBalanceRecord = await tx.loyaltyLedger.findFirst({
        where: {
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          target: 'BALANCE', // 兼容 legacy ORDER 与 Unified Payment 独立 balance ledger
        },
        orderBy: { createdAt: 'asc' },
      });
      const balanceUsedCents =
        redeemBalanceRecord && redeemBalanceRecord.deltaMicro < 0n
          ? Number(-redeemBalanceRecord.deltaMicro) / 10000
          : 0;

      if (redeemBalanceRecord && redeemBalanceRecord.deltaMicro < 0n) {
        const existedBalanceRefund = await tx.loyaltyLedger.findFirst({
          where: {
            orderId,
            type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
            target: 'BALANCE',
          },
        });

        if (!existedBalanceRefund) {
          const back = -redeemBalanceRecord.deltaMicro; // 取反（变正数）
          storeBalance += back; // ✅ 余额加回

          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
              target: 'BALANCE',
              sourceKey: LEDGER_SOURCE_FULL_REFUND_BALANCE,
              deltaMicro: back,
              balanceAfterMicro: storeBalance,
              note: 'return store balance on refund',
            },
          });
        }
      }

      // 3) 回退累计消费 & 等级。储值本金已在充值时累计，所以这里只回退
      // 原订单真正新增到 lifetimeSpendCents 的非储值部分。
      const lifetimeRollbackCents = computeTierEligibleSpendFromNetCents(
        netSubtotalCents,
        balanceUsedCents,
      );
      if (shouldAdjustLifetime && lifetimeRollbackCents > 0) {
        lifetimeSpendCents = Math.max(
          0,
          lifetimeSpendCents - lifetimeRollbackCents,
        );
      }
      const newTier = computeTierFromLifetime(
        lifetimeSpendCents,
        loyaltyConfig.tierThresholdCents,
      );

      // 4) 冲回推荐人奖励
      const referralLedger = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.REFERRAL_BONUS,
            sourceKey: LEDGER_SOURCE_ORDER,
          },
        },
        select: {
          accountId: true,
          deltaMicro: true,
        },
      });

      if (referralLedger && referralLedger.deltaMicro > 0n) {
        const existedReferralReverse = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type_sourceKey: {
              orderId,
              type: LoyaltyEntryType.REFUND_REVERSE_REFERRAL,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
            },
          },
          select: { id: true },
        });

        if (!existedReferralReverse) {
          const refAcc = await tx.loyaltyAccount.findUnique({
            where: { id: referralLedger.accountId },
            select: { id: true, pointsMicro: true },
          });

          if (refAcc) {
            await tx.$queryRaw`
              SELECT id
              FROM "LoyaltyAccount"
              WHERE id = ${refAcc.id}::uuid
              FOR UPDATE
            `;

            const refNewBal = refAcc.pointsMicro - referralLedger.deltaMicro;

            await tx.loyaltyLedger.create({
              data: {
                accountId: refAcc.id,
                orderId,
                type: LoyaltyEntryType.REFUND_REVERSE_REFERRAL,
                sourceKey: LEDGER_SOURCE_FULL_REFUND,
                deltaMicro: -referralLedger.deltaMicro,
                balanceAfterMicro: refNewBal,
                note: 'reverse referral bonus on refund',
              },
            });

            await tx.loyaltyAccount.update({
              where: { id: refAcc.id },
              data: {
                pointsMicro: refNewBal,
              },
            });
          }
        }
      }
      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: {
          pointsMicro: pointsBalance,
          balanceMicro: storeBalance, // ✅ 更新余额
          lifetimeSpendCents,
          tier: newTier,
        },
      });
    });
  }

  /** 工具：把“可抵扣的积分余额（micro）”换算成“最大可抵扣金额（分）” */
  async maxRedeemableCentsFromBalance(micro: bigint): Promise<number> {
    const loyaltyConfig = await this.getLoyaltyPolicySnapshot();
    return this.maxRedeemableCentsFromBalanceWithRate(
      micro,
      loyaltyConfig.redeemDollarPerPoint,
    );
  }

  private maxRedeemableCentsFromBalanceWithRate(
    micro: bigint,
    redeemDollarPerPoint: number,
  ): number {
    const dollars = dollarsFromPointsMicro(micro, redeemDollarPerPoint); // 可抵扣美元
    return Math.floor(dollars * 100);
  }

  private calculateRedeemableCentsFromBalance(
    balanceMicro: bigint,
    redeemDollarPerPoint: number,
    requestedPoints?: number,
    subtotalCents?: number,
  ): number {
    if (!requestedPoints || requestedPoints <= 0) return 0;

    const maxByBalance = this.maxRedeemableCentsFromBalanceWithRate(
      balanceMicro,
      redeemDollarPerPoint,
    );
    const rawCents = requestedPoints * redeemDollarPerPoint * 100;
    const requestedCents = Math.round(rawCents + 1e-6);
    const byUserInput = Math.min(requestedCents, maxByBalance);
    return Math.max(0, Math.min(byUserInput, subtotalCents ?? byUserInput));
  }

  private redeemCentsFromMicro(
    micro: bigint,
    redeemDollarPerPoint: number,
  ): number {
    return Math.round(
      dollarsFromPointsMicro(micro, redeemDollarPerPoint) * 100,
    );
  }

  async reserveRedeemForOrder(params: {
    tx: Prisma.TransactionClient;
    userId?: string;
    orderId: string;
    sourceKey?: string;
    requestedPoints?: number;
    subtotalAfterCoupon: number;
  }): Promise<number> {
    const {
      tx,
      userId,
      orderId,
      sourceKey,
      requestedPoints,
      subtotalAfterCoupon,
    } = params;
    const sk =
      typeof sourceKey === 'string' && sourceKey.trim().length > 0
        ? sourceKey.trim()
        : LEDGER_SOURCE_ORDER;

    if (!userId || subtotalAfterCoupon <= 0) return 0;
    const loyaltyConfig = await this.getLoyaltyPolicySnapshotWithTx(tx);

    const account = await this.ensureAccountWithTx(tx, userId);

    await tx.$queryRaw`
      SELECT id
      FROM "LoyaltyAccount"
      WHERE id = ${account.id}::uuid
      FOR UPDATE
    `;

    const existed = await tx.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId,
          type: LoyaltyEntryType.REDEEM_ON_ORDER,
          sourceKey: sk,
        },
      },
      select: { deltaMicro: true },
    });

    if (existed) {
      return this.redeemCentsFromMicro(
        -existed.deltaMicro,
        loyaltyConfig.redeemDollarPerPoint,
      );
    }

    const held = await tx.loyaltyTenderReservation.aggregate({
      where: { accountId: account.id, status: 'HELD' },
      _sum: { pointsMicro: true },
    });
    const availablePointsMicro =
      account.pointsMicro > (held._sum.pointsMicro ?? 0n)
        ? account.pointsMicro - (held._sum.pointsMicro ?? 0n)
        : 0n;

    const redeemValueCents = this.calculateRedeemableCentsFromBalance(
      availablePointsMicro,
      loyaltyConfig.redeemDollarPerPoint,
      requestedPoints,
      subtotalAfterCoupon,
    );

    if (redeemValueCents <= 0) return 0;

    const redeemMicro = toMicroPoints(
      redeemValueCents / 100 / loyaltyConfig.redeemDollarPerPoint,
    );

    if (redeemMicro > account.pointsMicro) {
      throw new BadRequestException('insufficient loyalty balance');
    }

    const newBal = account.pointsMicro - redeemMicro;

    await tx.loyaltyLedger.create({
      data: {
        accountId: account.id,
        orderId,
        type: LoyaltyEntryType.REDEEM_ON_ORDER,
        sourceKey: sk,
        deltaMicro: -redeemMicro,
        balanceAfterMicro: newBal,
        note: `reserve redeem $${(redeemValueCents / 100).toFixed(2)}`,
      },
    });

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { pointsMicro: newBal },
    });

    return redeemValueCents;
  }

  /**
   * 充值：顾客储值 → 增加积分余额 + 累计消费（并更新等级）
   * 默认规则：1 CAD 储值 = 1 积分
   * 奖励积分请通过 adjustPointsManual 手动写账（例如送 20 pt）
   */
  async applyTopup(params: {
    userStableId: string;
    amountCents: number;
    idempotencyKey: string;
    pointsToCredit?: number; // 这里的 points 其实对应本金价值
    bonusPoints?: number;
  }): Promise<{
    amountCents: number;
    pointsCredited: number;
    bonusPoints: number;
    referralPointsCredited: number;
    storeBalance: number;
    pointsBalance: number;
    tierBefore: Tier;
    tierAfter: Tier;
    lifetimeSpendCentsBefore: number;
    lifetimeSpendCentsAfter: number;
    receiptId: string;
    bonusReceiptId?: string;
    referralReceiptId?: string;
  }> {
    const {
      userStableId,
      amountCents,
      idempotencyKey,
      pointsToCredit,
      bonusPoints,
    } = params;

    const cents = Number.isFinite(amountCents) ? Math.round(amountCents) : NaN;
    if (!Number.isFinite(cents) || cents <= 0) {
      throw new BadRequestException('amountCents must be a positive number');
    }

    const ik = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!ik) throw new BadRequestException('idempotencyKey is required');
    if (ik.length > IDEMPOTENCY_KEY_MAX_LENGTH)
      throw new BadRequestException('idempotencyKey is too long');

    const bonus = typeof bonusPoints === 'number' ? bonusPoints : 0;
    if (!Number.isFinite(bonus) || bonus < 0) {
      throw new BadRequestException('bonusPoints must be >= 0');
    }

    const topupResult = await this.prisma.$transaction(async (tx) => {
      // 0) 解析 userId
      const userId = await this.resolveUserIdByStableIdWithTx(tx, userStableId);
      const loyaltyConfig = await this.getLoyaltyPolicySnapshotWithTx(tx);

      // 1) 确保账户存在
      const acc = await this.ensureAccountWithTx(tx, userId);

      // 2) 幂等检查 (省略部分重复逻辑，保留核心)
      const existedTopup = await tx.loyaltyLedger.findUnique({
        where: { idempotencyKey: ik },
        select: {
          id: true,
          accountId: true,
          balanceAfterMicro: true,
          deltaMicro: true,
        },
      });

      if (existedTopup) {
        if (existedTopup.accountId !== acc.id) {
          throw new BadRequestException('idempotencyKey already used');
        }
        // ... (保留这里的返回逻辑，可以使用当前 acc 的状态返回)
        return {
          userId,
          amountCents: cents,
          pointsCredited: Number(existedTopup.deltaMicro) / 1_000_000,
          bonusPoints: bonus,
          referralPointsCredited: 0,
          storeBalance: Number(acc.balanceMicro) / 1_000_000,
          pointsBalance: Number(acc.pointsMicro) / 1_000_000,
          tierBefore: acc.tier as Tier,
          tierAfter: acc.tier as Tier,
          lifetimeSpendCentsBefore: acc.lifetimeSpendCents,
          lifetimeSpendCentsAfter: acc.lifetimeSpendCents,
          receiptId: ik,
        };
      }

      // 3) 正常路径：锁账户
      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${acc.id}::uuid
        FOR UPDATE
      `;

      const tierBefore = acc.tier as Tier;
      const lifetimeSpendCentsBefore = acc.lifetimeSpendCents ?? 0;

      const topupOrder = await tx.order.create({
        data: {
          status: 'paid',
          paidAt: new Date(),
          paymentMethod: PaymentMethod.CASH,
          channel: Channel.in_store,
          fulfillmentType: FulfillmentType.pickup,
          userId,
          subtotalCents: cents,
          taxCents: 0,
          totalCents: cents,
          subtotalAfterDiscountCents: cents,
          loyaltyRedeemCents: 0,
          couponDiscountCents: 0,
        },
        select: { id: true },
      });

      // 计算本金部分 (pointsToCredit 通常等于 amountCents/100)
      const pts =
        typeof pointsToCredit === 'number' ? pointsToCredit : cents / 100;
      if (!Number.isFinite(pts) || pts <= 0) {
        throw new BadRequestException(
          'pointsToCredit must be a positive number',
        );
      }

      const topupMicro = toMicroPoints(pts); // 本金
      const bonusMicro = bonus > 0 ? toMicroPoints(bonus) : 0n; // 赠送

      // ✅ 3.1 处理本金 -> 进入 BALANCE
      // 修复错误的核心：定义 newBalance
      const newBalance = acc.balanceMicro + topupMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId: topupOrder.id,
          sourceKey: LEDGER_SOURCE_TOPUP,
          type: LoyaltyEntryType.TOPUP_PURCHASED,
          target: 'BALANCE', // 标记为余额
          deltaMicro: topupMicro,
          balanceAfterMicro: newBalance,
          note: `topup $${(cents / 100).toFixed(2)} (Principal)`,
          idempotencyKey: ik,
        },
        select: { id: true },
      });

      // ✅ 3.2 处理赠送 -> 进入 POINTS
      // 修复错误的核心：定义 newPoints
      let newPoints = acc.pointsMicro;
      const bonusKey = buildIdempotencyChildKey(ik, 'BONUS');
      let bonusLedgerId: string | undefined;

      if (bonusMicro !== 0n) {
        newPoints = newPoints + bonusMicro; // 累加积分

        const bonusLedger = await tx.loyaltyLedger.create({
          data: {
            accountId: acc.id,
            orderId: topupOrder.id,
            sourceKey: LEDGER_SOURCE_TOPUP,
            type: LoyaltyEntryType.ADJUSTMENT_MANUAL, // 或定义 TOPUP_BONUS
            target: 'POINTS', // 标记为积分
            deltaMicro: bonusMicro,
            balanceAfterMicro: newPoints,
            note: `topup bonus ${bonus.toFixed(2)} pts`,
            idempotencyKey: bonusKey,
          },
          select: { id: true },
        });
        bonusLedgerId = bonusLedger.id;
      }

      // 4) lifetime + tier
      const lifetimeSpendCentsAfter = lifetimeSpendCentsBefore + cents;
      const tierAfter = computeTierFromLifetime(
        lifetimeSpendCentsAfter,
        loyaltyConfig.tierThresholdCents,
      );

      // ✅ 5) 更新账户 (同时更新 newPoints 和 newBalance)
      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: {
          pointsMicro: newPoints, // 这里的变量现在已经定义了
          balanceMicro: newBalance, // 这里的变量现在已经定义了
          lifetimeSpendCents: lifetimeSpendCentsAfter,
          tier: tierAfter,
        },
      });

      // 6) 推荐人奖励 (保持逻辑不变，进 POINTS)
      let referralPtsCredited = 0;
      let referralLedgerId: string | undefined;
      const refKey = buildIdempotencyChildKey(ik, 'REF');

      if (loyaltyConfig.referralPtPerDollar > 0 && cents > 0) {
        const u = await tx.user.findUnique({
          where: { id: userId },
          select: { referredByUserId: true },
        });
        const refUserId = u?.referredByUserId;

        if (refUserId && refUserId !== userId) {
          const refPts = (cents / 100) * loyaltyConfig.referralPtPerDollar;
          const refMicro = toMicroPoints(refPts);

          if (refMicro > 0n) {
            const refAcc = await this.ensureAccountWithTx(tx, refUserId);
            // ... (锁 refAcc) ...
            const refNewBal = refAcc.pointsMicro + refMicro; // 推荐奖励通常给积分

            const refLedger = await tx.loyaltyLedger.create({
              data: {
                accountId: refAcc.id,
                orderId: topupOrder.id,
                sourceKey: LEDGER_SOURCE_TOPUP,
                type: LoyaltyEntryType.REFERRAL_BONUS,
                target: 'POINTS',
                deltaMicro: refMicro,
                balanceAfterMicro: refNewBal,
                note: `referral bonus on topup`,
                idempotencyKey: refKey,
              },
              select: { id: true },
            });

            await tx.loyaltyAccount.update({
              where: { id: refAcc.id },
              data: { pointsMicro: refNewBal },
            });
            referralPtsCredited = refPts;
            referralLedgerId = refLedger.id;
          }
        }
      }

      return {
        userId,
        amountCents: cents,
        pointsCredited: pts,
        bonusPoints: bonus,
        referralPointsCredited: referralPtsCredited,
        storeBalance: Number(newBalance) / 1_000_000,
        pointsBalance: Number(newPoints) / 1_000_000,
        tierBefore,
        tierAfter,
        lifetimeSpendCentsBefore,
        lifetimeSpendCentsAfter,
        receiptId: ik,
        bonusReceiptId: bonusLedgerId ? bonusKey : undefined,
        referralReceiptId: referralLedgerId ? refKey : undefined,
      };
    });

    if (isTierUpgrade(topupResult.tierBefore, topupResult.tierAfter)) {
      const user = await this.prisma.user.findUnique({
        where: { id: topupResult.userId },
      });
      if (user) {
        await this.couponTriggerService.issueProgramsForUser(
          'TIER_UPGRADE',
          user,
        );
      }
    }

    const { userId, ...result } = topupResult;
    void userId;
    return result;
  }

  private roundMulDiv(
    micro: bigint,
    newNetCents: number,
    baseNetCents: number,
  ): bigint {
    if (baseNetCents <= 0) return 0n;
    const n = BigInt(newNetCents);
    const d = BigInt(baseNetCents);
    return (micro * n + d / 2n) / d; // 四舍五入
  }

  async applyAmendmentAdjustments(params: {
    tx: Prisma.TransactionClient;
    orderId: string;
    userId: string;
    amendmentStableId: string;

    baseNetSubtotalCents: number; // settleOnPaid 口径：subtotal - redeem
    newNetSubtotalCents: number;

    redeemReturnCents: number; // 本次需要补回的“积分抵扣现金价值”（分）
  }): Promise<{
    redeemReturnMicro: bigint;
    earnAdjustMicro: bigint;
    referralAdjustMicro: bigint;
  }> {
    const {
      tx,
      orderId,
      userId,
      amendmentStableId,
      baseNetSubtotalCents,
      newNetSubtotalCents,
      redeemReturnCents,
    } = params;

    const sourceKey = ledgerSourceAmend(amendmentStableId);
    const loyaltyConfig = await this.getLoyaltyPolicySnapshotWithTx(tx);

    // 幂等锚点：同一 amendment 不重复做
    const existed = await tx.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId,
          type: LoyaltyEntryType.AMEND_EARN_ADJUST,
          sourceKey,
        },
      },
      select: { id: true },
    });

    if (existed) {
      // 已经执行过该 amendment：把当时写入的三条 ledger 读出来返回（重试时返回真实值）
      const rows = await tx.loyaltyLedger.findMany({
        where: {
          orderId,
          sourceKey,
          type: {
            in: [
              LoyaltyEntryType.AMEND_RETURN_REDEEM,
              LoyaltyEntryType.AMEND_EARN_ADJUST,
              LoyaltyEntryType.AMEND_REFERRAL_ADJUST,
            ],
          },
        },
        select: { type: true, deltaMicro: true },
      });

      const redeemReturnMicro =
        rows.find((r) => r.type === LoyaltyEntryType.AMEND_RETURN_REDEEM)
          ?.deltaMicro ?? 0n;

      const earnAdjustMicro =
        rows.find((r) => r.type === LoyaltyEntryType.AMEND_EARN_ADJUST)
          ?.deltaMicro ?? 0n;

      const referralAdjustMicro =
        rows.find((r) => r.type === LoyaltyEntryType.AMEND_REFERRAL_ADJUST)
          ?.deltaMicro ?? 0n;

      return { redeemReturnMicro, earnAdjustMicro, referralAdjustMicro };
    }

    // 1) 锁顾客账户
    const acc = await this.ensureAccountWithTx(tx, userId);

    await tx.$queryRaw`
      SELECT id
      FROM "LoyaltyAccount"
      WHERE id = ${acc.id}::uuid
      FOR UPDATE
    `;

    let balance = acc.pointsMicro;
    let lifetimeSpendCents = acc.lifetimeSpendCents ?? 0;

    const originalBalanceLedger = await tx.loyaltyLedger.findFirst({
      where: {
        orderId,
        type: LoyaltyEntryType.REDEEM_ON_ORDER,
        target: 'BALANCE',
      },
      orderBy: { createdAt: 'asc' },
      select: { deltaMicro: true },
    });
    const balanceUsedCents =
      originalBalanceLedger && originalBalanceLedger.deltaMicro < 0n
        ? Number(-originalBalanceLedger.deltaMicro) / 10000
        : 0;
    const baseTierSpendCents = computeTierEligibleSpendFromNetCents(
      baseNetSubtotalCents,
      balanceUsedCents,
    );
    const newTierSpendCents = computeTierEligibleSpendFromNetCents(
      newNetSubtotalCents,
      balanceUsedCents,
    );

    // 2) 补回 redeem（只会为正）
    let redeemReturnMicro = 0n;
    if (redeemReturnCents > 0) {
      redeemReturnMicro = toMicroPoints(
        redeemReturnCents / 100 / loyaltyConfig.redeemDollarPerPoint,
      );

      const newBal = balance + redeemReturnMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId,
          type: LoyaltyEntryType.AMEND_RETURN_REDEEM,
          sourceKey,
          deltaMicro: redeemReturnMicro,
          balanceAfterMicro: newBal,
          note: `amend return redeem $${(redeemReturnCents / 100).toFixed(2)}`,
        },
      });

      balance = newBal;
    }

    // 3) earn 调整：按原单已发放 earn（ORDER）做比例缩放
    let earnAdjustMicro = 0n;

    const earn0 = await tx.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId,
          type: LoyaltyEntryType.EARN_ON_PURCHASE,
          sourceKey: LEDGER_SOURCE_ORDER,
        },
      },
      select: { deltaMicro: true },
    });

    if (earn0 && earn0.deltaMicro > 0n && baseNetSubtotalCents > 0) {
      const expectedEarnNew = this.roundMulDiv(
        earn0.deltaMicro,
        newNetSubtotalCents,
        baseNetSubtotalCents,
      );
      earnAdjustMicro = expectedEarnNew - earn0.deltaMicro; // 可正可负

      if (earnAdjustMicro !== 0n) {
        const newBal = balance + earnAdjustMicro;

        await tx.loyaltyLedger.create({
          data: {
            accountId: acc.id,
            orderId,
            type: LoyaltyEntryType.AMEND_EARN_ADJUST,
            sourceKey,
            deltaMicro: earnAdjustMicro,
            balanceAfterMicro: newBal,
            note: `amend earn adjust (baseNet=${baseNetSubtotalCents} newNet=${newNetSubtotalCents})`,
          },
        });

        balance = newBal;
      } else {
        // 写 0 作为幂等锚点
        await tx.loyaltyLedger.create({
          data: {
            accountId: acc.id,
            orderId,
            type: LoyaltyEntryType.AMEND_EARN_ADJUST,
            sourceKey,
            deltaMicro: 0n,
            balanceAfterMicro: balance,
            note: `amend earn adjust noop`,
          },
        });
      }
    } else {
      // 没有原始 earn 也写锚点
      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId,
          type: LoyaltyEntryType.AMEND_EARN_ADJUST,
          sourceKey,
          deltaMicro: 0n,
          balanceAfterMicro: balance,
          note: `amend earn adjust noop`,
        },
      });
    }

    // 4) lifetimeSpend 调整：储值本金在充值时已经累计，所以改单只调整
    // 原订单非储值部分对应的等级消费金额。
    const deltaTierSpend = newTierSpendCents - baseTierSpendCents;
    if (deltaTierSpend !== 0) {
      lifetimeSpendCents = Math.max(0, lifetimeSpendCents + deltaTierSpend);
    }
    const newTier = computeTierFromLifetime(
      lifetimeSpendCents,
      loyaltyConfig.tierThresholdCents,
    );

    await tx.loyaltyAccount.update({
      where: { id: acc.id },
      data: {
        pointsMicro: balance,
        lifetimeSpendCents,
        tier: newTier,
      },
    });

    // 5) 推荐人奖励调整（按原单推荐奖励比例缩放）
    let referralAdjustMicro = 0n;

    const ref0 = await tx.loyaltyLedger.findUnique({
      where: {
        orderId_type_sourceKey: {
          orderId,
          type: LoyaltyEntryType.REFERRAL_BONUS,
          sourceKey: LEDGER_SOURCE_ORDER,
        },
      },
      select: { accountId: true, deltaMicro: true },
    });

    if (ref0 && ref0.deltaMicro > 0n && baseTierSpendCents > 0) {
      const expectedRefNew = this.roundMulDiv(
        ref0.deltaMicro,
        newTierSpendCents,
        baseTierSpendCents,
      );

      referralAdjustMicro = expectedRefNew - ref0.deltaMicro;

      if (referralAdjustMicro !== 0n) {
        const refAcc = await tx.loyaltyAccount.findUnique({
          where: { id: ref0.accountId },
          select: { id: true, pointsMicro: true },
        });

        if (refAcc) {
          await tx.$queryRaw`
            SELECT id
            FROM "LoyaltyAccount"
            WHERE id = ${refAcc.id}::uuid
            FOR UPDATE
          `;

          const refNewBal = refAcc.pointsMicro + referralAdjustMicro;

          await tx.loyaltyLedger.create({
            data: {
              accountId: refAcc.id,
              orderId,
              type: LoyaltyEntryType.AMEND_REFERRAL_ADJUST,
              sourceKey,
              deltaMicro: referralAdjustMicro,
              balanceAfterMicro: refNewBal,
              note: `amend referral adjust (baseNet=${baseNetSubtotalCents} newNet=${newNetSubtotalCents})`,
            },
          });

          await tx.loyaltyAccount.update({
            where: { id: refAcc.id },
            data: { pointsMicro: refNewBal },
          });
        }
      }
    }

    return { redeemReturnMicro, earnAdjustMicro, referralAdjustMicro };
  }

  /**
   * 手动调账：例如活动奖励、客服补偿等
   * deltaPoints 可正可负（不影响 lifetimeSpendCents）
   */
  async adjustPointsManual(params: {
    userStableId: string;
    deltaPoints: number;
    idempotencyKey: string;
    note?: string;
  }): Promise<{
    deltaPoints: number;
    pointsBalanceBefore: number;
    pointsBalanceAfter: number;
    receiptId: string;
  }> {
    const { userStableId, deltaPoints, idempotencyKey, note } = params;

    const dp = typeof deltaPoints === 'number' ? deltaPoints : NaN;
    if (!Number.isFinite(dp) || dp === 0) {
      throw new BadRequestException('deltaPoints must be a non-zero number');
    }

    const ik = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!ik) throw new BadRequestException('idempotencyKey is required');
    if (ik.length > IDEMPOTENCY_KEY_MAX_LENGTH)
      throw new BadRequestException('idempotencyKey is too long');

    const cleanNote = typeof note === 'string' ? note.trim() : undefined;

    return this.prisma.$transaction(async (tx) => {
      const userId = await this.resolveUserIdByStableIdWithTx(tx, userStableId);
      const acc = await this.ensureAccountWithTx(tx, userId);

      // 幂等：先查
      const existed = await tx.loyaltyLedger.findUnique({
        where: { idempotencyKey: ik },
        select: {
          id: true,
          accountId: true,
          deltaMicro: true,
          balanceAfterMicro: true,
          type: true,
        },
      });

      if (existed) {
        if (existed.accountId !== acc.id) {
          throw new BadRequestException('idempotencyKey already used');
        }
        if (existed.type !== LoyaltyEntryType.ADJUSTMENT_MANUAL) {
          throw new BadRequestException(
            'idempotencyKey used by a different operation',
          );
        }

        const delta = Number(existed.deltaMicro) / 1_000_000;
        if (Math.abs(delta - dp) > 1e-9) {
          throw new BadRequestException(
            'idempotencyKey reused with different payload',
          );
        }

        const after = Number(existed.balanceAfterMicro) / 1_000_000;
        const before = after - delta;

        return {
          deltaPoints: delta,
          pointsBalanceBefore: before,
          pointsBalanceAfter: after,
          receiptId: ik,
        };
      }

      // 正常路径：锁账户
      await tx.$queryRaw`
      SELECT id
      FROM "LoyaltyAccount"
      WHERE id = ${acc.id}::uuid
      FOR UPDATE
    `;

      const deltaMicro = toMicroPoints(dp);
      const newBal = acc.pointsMicro + deltaMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId: null,
          sourceKey: LEDGER_SOURCE_MANUAL,
          type: LoyaltyEntryType.ADJUSTMENT_MANUAL,
          deltaMicro,
          balanceAfterMicro: newBal,
          note: cleanNote ?? 'manual adjustment',
          idempotencyKey: ik,
        },
        select: { id: true },
      });

      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: { pointsMicro: newBal },
      });

      return {
        deltaPoints: dp,
        pointsBalanceBefore: Number(acc.pointsMicro) / 1_000_000,
        pointsBalanceAfter: Number(newBal) / 1_000_000,
        receiptId: ik,
      };
    });
  }
}
