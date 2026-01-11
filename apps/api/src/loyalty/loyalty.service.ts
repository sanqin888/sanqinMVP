// apps/api/src/loyalty/loyalty.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessConfig, LoyaltyEntryType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const MICRO_PER_POINT = 1_000_000n; // 1 pt = 1e6 micro-pts，避免小数误差

const LEDGER_SOURCE_ORDER = 'ORDER';
const LEDGER_SOURCE_FULL_REFUND = 'FULL_REFUND';
const ledgerSourceAmend = (amendStableId: string) => `AMEND:${amendStableId}`;
const LEDGER_SOURCE_TOPUP = 'TOPUP';
const LEDGER_SOURCE_MANUAL = 'MANUAL';
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const DEFAULT_EARN_PT_PER_DOLLAR = 0.01;
const DEFAULT_REDEEM_DOLLAR_PER_POINT = 1;
const DEFAULT_REFERRAL_PT_PER_DOLLAR = 0.01;
const DEFAULT_TIER_THRESHOLD_SILVER = 1000 * 100;
const DEFAULT_TIER_THRESHOLD_GOLD = 10000 * 100;
const DEFAULT_TIER_THRESHOLD_PLATINUM = 30000 * 100;

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
type LoyaltyConfig = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierThresholdCents: Record<Exclude<Tier, 'BRONZE'>, number>;
};

// 等级倍率
const TIER_MULTIPLIER: Record<Tier, number> = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 5,
};

function computeTierFromLifetime(
  lifetimeSpendCents: number,
  thresholds: LoyaltyConfig['tierThresholdCents'],
): Tier {
  if (lifetimeSpendCents >= thresholds.PLATINUM) return 'PLATINUM';
  if (lifetimeSpendCents >= thresholds.GOLD) return 'GOLD';
  if (lifetimeSpendCents >= thresholds.SILVER) return 'SILVER';
  return 'BRONZE';
}

function toMicroPoints(points: number): bigint {
  // 四舍五入到 micro
  return BigInt(Math.round(points * Number(MICRO_PER_POINT)));
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
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureBusinessConfig(): Promise<BusinessConfig> {
    return (
      (await this.prisma.businessConfig.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.businessConfig.create({
        data: {
          id: 1,
          storeName: '',
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          earnPtPerDollar: DEFAULT_EARN_PT_PER_DOLLAR,
          redeemDollarPerPoint: DEFAULT_REDEEM_DOLLAR_PER_POINT,
          referralPtPerDollar: DEFAULT_REFERRAL_PT_PER_DOLLAR,
          tierThresholdSilver: DEFAULT_TIER_THRESHOLD_SILVER,
          tierThresholdGold: DEFAULT_TIER_THRESHOLD_GOLD,
          tierThresholdPlatinum: DEFAULT_TIER_THRESHOLD_PLATINUM,
        },
      }))
    );
  }

  private async ensureBusinessConfigWithTx(
    tx: Prisma.TransactionClient,
  ): Promise<BusinessConfig> {
    return (
      (await tx.businessConfig.findUnique({ where: { id: 1 } })) ??
      (await tx.businessConfig.create({
        data: {
          id: 1,
          storeName: '',
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          earnPtPerDollar: DEFAULT_EARN_PT_PER_DOLLAR,
          redeemDollarPerPoint: DEFAULT_REDEEM_DOLLAR_PER_POINT,
          referralPtPerDollar: DEFAULT_REFERRAL_PT_PER_DOLLAR,
          tierThresholdSilver: DEFAULT_TIER_THRESHOLD_SILVER,
          tierThresholdGold: DEFAULT_TIER_THRESHOLD_GOLD,
          tierThresholdPlatinum: DEFAULT_TIER_THRESHOLD_PLATINUM,
        },
      }))
    );
  }

  private normalizeLoyaltyConfig(config: BusinessConfig): LoyaltyConfig {
    const earnPtPerDollar =
      typeof config.earnPtPerDollar === 'number' &&
      Number.isFinite(config.earnPtPerDollar) &&
      config.earnPtPerDollar >= 0
        ? config.earnPtPerDollar
        : DEFAULT_EARN_PT_PER_DOLLAR;
    const redeemDollarPerPoint =
      typeof config.redeemDollarPerPoint === 'number' &&
      Number.isFinite(config.redeemDollarPerPoint) &&
      config.redeemDollarPerPoint > 0
        ? config.redeemDollarPerPoint
        : DEFAULT_REDEEM_DOLLAR_PER_POINT;
    const referralPtPerDollar =
      typeof config.referralPtPerDollar === 'number' &&
      Number.isFinite(config.referralPtPerDollar) &&
      config.referralPtPerDollar >= 0
        ? config.referralPtPerDollar
        : DEFAULT_REFERRAL_PT_PER_DOLLAR;
    const tierThresholdSilver =
      typeof config.tierThresholdSilver === 'number' &&
      Number.isFinite(config.tierThresholdSilver) &&
      config.tierThresholdSilver >= 0
        ? config.tierThresholdSilver
        : DEFAULT_TIER_THRESHOLD_SILVER;
    const tierThresholdGold =
      typeof config.tierThresholdGold === 'number' &&
      Number.isFinite(config.tierThresholdGold) &&
      config.tierThresholdGold >= 0
        ? config.tierThresholdGold
        : DEFAULT_TIER_THRESHOLD_GOLD;
    const tierThresholdPlatinum =
      typeof config.tierThresholdPlatinum === 'number' &&
      Number.isFinite(config.tierThresholdPlatinum) &&
      config.tierThresholdPlatinum >= 0
        ? config.tierThresholdPlatinum
        : DEFAULT_TIER_THRESHOLD_PLATINUM;

    return {
      earnPtPerDollar,
      redeemDollarPerPoint,
      referralPtPerDollar,
      tierThresholdCents: {
        SILVER: tierThresholdSilver,
        GOLD: tierThresholdGold,
        PLATINUM: tierThresholdPlatinum,
      },
    };
  }

  private async getLoyaltyConfig(): Promise<LoyaltyConfig> {
    const config = await this.ensureBusinessConfig();
    return this.normalizeLoyaltyConfig(config);
  }

  private async getLoyaltyConfigWithTx(
    tx: Prisma.TransactionClient,
  ): Promise<LoyaltyConfig> {
    const config = await this.ensureBusinessConfigWithTx(tx);
    return this.normalizeLoyaltyConfig(config);
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
        tier: 'BRONZE',
        lifetimeSpendCents: 0,
      },
      update: {},
      select: {
        id: true,
        userId: true,
        pointsMicro: true,
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
        tier: 'BRONZE',
        lifetimeSpendCents: 0,
      },
      update: {},
      select: {
        id: true,
        userId: true,
        pointsMicro: true,
        tier: true,
        lifetimeSpendCents: true,
      },
    });
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
    subtotalCents: number; // 原小计（税前、未扣积分）
    redeemValueCents: number; // 本单抵扣掉的“现金价值”（分）
    tier?: Tier; // 可选：外部传入，自定义当前等级
  }) {
    const { orderId, userId, subtotalCents, redeemValueCents, tier } = params;
    if (!userId) return; // 匿名单不处理
    const loyaltyConfig = await this.getLoyaltyConfig();

    await this.prisma.$transaction(async (tx) => {
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

      // 3) 赚取积分
      const accountTier: Tier = tier ?? (accRaw.tier as Tier);

      const earnedPts =
        (netSubtotalCents / 100) *
        loyaltyConfig.earnPtPerDollar *
        TIER_MULTIPLIER[accountTier];

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
                loyaltyConfig.earnPtPerDollar * TIER_MULTIPLIER[accountTier]
              ).toFixed(4)} pt/$`,
            },
          });

          balance = newBal;
        }
      }

      // 4) 累加累计实际消费
      lifetimeSpendCents += netSubtotalCents;

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
      if (loyaltyConfig.referralPtPerDollar > 0 && netSubtotalCents > 0) {
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
              (netSubtotalCents / 100) * loyaltyConfig.referralPtPerDollar;
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
    });
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
        couponDiscountCents: true,
        loyaltyRedeemCents: true,
      },
    });
    if (!order?.userId) return;
    const loyaltyConfig = await this.getLoyaltyConfig();

    const netSubtotalCents = Math.max(
      0,
      (order.subtotalCents ?? 0) -
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

      let balance = acc.pointsMicro;
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
          const newBal = balance - earn.deltaMicro;

          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.REFUND_REVERSE_EARN,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
              deltaMicro: -earn.deltaMicro,
              balanceAfterMicro: newBal,
              note: 'reverse earned on refund',
            },
          });

          balance = newBal;
          shouldAdjustLifetime = true;
        }
      }

      // 2) 退回抵扣积分
      const redeem = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.REDEEM_ON_ORDER,
            sourceKey: LEDGER_SOURCE_ORDER,
          },
        },
        select: { deltaMicro: true },
      });

      if (redeem && redeem.deltaMicro < 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type_sourceKey: {
              orderId,
              type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
            },
          },
          select: { id: true },
        });

        if (!existed) {
          const back = -redeem.deltaMicro;
          const newBal = balance + back;

          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
              sourceKey: LEDGER_SOURCE_FULL_REFUND,
              deltaMicro: back,
              balanceAfterMicro: newBal,
              note: 'return redeemed on refund',
            },
          });

          balance = newBal;
        }
      }

      // 3) 回退累计消费 & 等级
      if (shouldAdjustLifetime && netSubtotalCents > 0) {
        lifetimeSpendCents = Math.max(0, lifetimeSpendCents - netSubtotalCents);
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
          pointsMicro: balance,
          lifetimeSpendCents,
          tier: newTier,
        },
      });
    });
  }

  /** 工具：把“可抵扣的积分余额（micro）”换算成“最大可抵扣金额（分）” */
  async maxRedeemableCentsFromBalance(micro: bigint): Promise<number> {
    const loyaltyConfig = await this.getLoyaltyConfig();
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
    const loyaltyConfig = await this.getLoyaltyConfigWithTx(tx);

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

    const redeemValueCents = this.calculateRedeemableCentsFromBalance(
      account.pointsMicro,
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
    pointsToCredit?: number;
    bonusPoints?: number;
  }): Promise<{
    amountCents: number;
    pointsCredited: number;
    bonusPoints: number;
    referralPointsCredited: number;
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

    return this.prisma.$transaction(async (tx) => {
      // 0) 解析 stableId -> userId（放在 tx 里）
      const userId = await this.resolveUserIdByStableIdWithTx(tx, userStableId);
      const loyaltyConfig = await this.getLoyaltyConfigWithTx(tx);

      // 1) 确保账户存在
      const acc = await this.ensureAccountWithTx(tx, userId);

      // 2) 幂等：同一个 key 只允许执行一次（以“充值主分录”为锚点）
      const existedTopup = await tx.loyaltyLedger.findUnique({
        where: { idempotencyKey: ik },
        select: {
          id: true,
          accountId: true,
          deltaMicro: true,
          balanceAfterMicro: true,
        },
      });

      // 读取 bonus/referral（若存在）
      const bonusKey = buildIdempotencyChildKey(ik, 'BONUS');
      const refKey = buildIdempotencyChildKey(ik, 'REF');

      const [existedBonus, existedRef] = await Promise.all([
        tx.loyaltyLedger.findUnique({
          where: { idempotencyKey: bonusKey },
          select: {
            id: true,
            accountId: true,
            deltaMicro: true,
            balanceAfterMicro: true,
          },
        }),
        tx.loyaltyLedger.findUnique({
          where: { idempotencyKey: refKey },
          select: { id: true, accountId: true, deltaMicro: true },
        }),
      ]);

      if (existedTopup) {
        // 防止跨用户复用
        if (existedTopup.accountId !== acc.id) {
          throw new BadRequestException('idempotencyKey already used');
        }

        // 校验 payload 一致性（防止同 key 不同内容）
        const expectedPts =
          typeof pointsToCredit === 'number' ? pointsToCredit : cents / 100;

        const creditedPts = Number(existedTopup.deltaMicro) / 1_000_000;
        if (Math.abs(creditedPts - expectedPts) > 1e-9) {
          throw new BadRequestException(
            'idempotencyKey reused with different payload',
          );
        }

        if (bonus > 0) {
          if (!existedBonus) {
            throw new BadRequestException(
              'idempotencyKey missing bonus ledger',
            );
          }
          if (existedBonus.accountId !== acc.id) {
            throw new BadRequestException('idempotencyKey bonus mismatch');
          }
          const bonusPts = Number(existedBonus.deltaMicro) / 1_000_000;
          if (Math.abs(bonusPts - bonus) > 1e-9) {
            throw new BadRequestException(
              'idempotencyKey reused with different bonusPoints',
            );
          }
        }

        // 返回：尽量稳定（tier/lifetime 用当前账户值推导，重试一般紧邻发生）
        const accNow = await tx.loyaltyAccount.findUnique({
          where: { id: acc.id },
          select: { tier: true, lifetimeSpendCents: true },
        });

        const lifetimeSpendCentsAfter = accNow?.lifetimeSpendCents ?? 0;
        const lifetimeSpendCentsBefore = Math.max(
          0,
          lifetimeSpendCentsAfter - cents,
        );
        const tierAfter = (accNow?.tier ?? acc.tier) as Tier;
        const tierBefore = computeTierFromLifetime(
          lifetimeSpendCentsBefore,
          loyaltyConfig.tierThresholdCents,
        );

        const finalBalanceMicro =
          bonus > 0 && existedBonus
            ? existedBonus.balanceAfterMicro
            : existedTopup.balanceAfterMicro;

        const referralPts = existedRef
          ? Number(existedRef.deltaMicro) / 1_000_000
          : 0;

        return {
          amountCents: cents,
          pointsCredited: creditedPts,
          bonusPoints: bonus,
          referralPointsCredited: referralPts,
          pointsBalance: Number(finalBalanceMicro) / 1_000_000,
          tierBefore,
          tierAfter,
          lifetimeSpendCentsBefore,
          lifetimeSpendCentsAfter,
          receiptId: ik,
          bonusReceiptId: existedBonus ? bonusKey : undefined,
          referralReceiptId: existedRef ? refKey : undefined,
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

      const pts =
        typeof pointsToCredit === 'number' ? pointsToCredit : cents / 100;

      if (!Number.isFinite(pts) || pts <= 0) {
        throw new BadRequestException(
          'pointsToCredit must be a positive number',
        );
      }

      const topupMicro = toMicroPoints(pts);
      const bonusMicro = bonus > 0 ? toMicroPoints(bonus) : 0n;

      // 先加充值，再加 bonus（bonus 不影响 lifetime）
      let balance = acc.pointsMicro + topupMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId: null,
          sourceKey: LEDGER_SOURCE_TOPUP,
          type: LoyaltyEntryType.TOPUP_PURCHASED,
          deltaMicro: topupMicro,
          balanceAfterMicro: balance,
          note: `topup $${(cents / 100).toFixed(2)} → ${pts.toFixed(2)} pts`,
          idempotencyKey: ik,
        },
        select: { id: true },
      });

      let bonusLedgerId: string | undefined;
      if (bonusMicro !== 0n) {
        balance = balance + bonusMicro;

        const bonusLedger = await tx.loyaltyLedger.create({
          data: {
            accountId: acc.id,
            orderId: null,
            sourceKey: LEDGER_SOURCE_TOPUP,
            type: LoyaltyEntryType.ADJUSTMENT_MANUAL,
            deltaMicro: bonusMicro,
            balanceAfterMicro: balance,
            note: `topup bonus ${bonus.toFixed(2)} pts`,
            idempotencyKey: bonusKey,
          },
          select: { id: true },
        });

        bonusLedgerId = bonusLedger.id;
      }

      // 4) lifetime + tier（充值算累计消费）
      const lifetimeSpendCentsAfter = lifetimeSpendCentsBefore + cents;
      const tierAfter = computeTierFromLifetime(
        lifetimeSpendCentsAfter,
        loyaltyConfig.tierThresholdCents,
      );

      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: {
          pointsMicro: balance,
          lifetimeSpendCents: lifetimeSpendCentsAfter,
          tier: tierAfter,
        },
      });

      // 5) 推荐人奖励：按充值金额给一定比例（referralPtPerDollar）
      let referralPtsCredited = 0;
      let referralLedgerId: string | undefined;

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

            await tx.$queryRaw`
            SELECT id
            FROM "LoyaltyAccount"
            WHERE id = ${refAcc.id}::uuid
            FOR UPDATE
          `;

            const refNewBal = refAcc.pointsMicro + refMicro;

            const refLedger = await tx.loyaltyLedger.create({
              data: {
                accountId: refAcc.id,
                orderId: null,
                sourceKey: LEDGER_SOURCE_TOPUP,
                type: LoyaltyEntryType.REFERRAL_BONUS,
                deltaMicro: refMicro,
                balanceAfterMicro: refNewBal,
                note: `referral bonus on topup $${(cents / 100).toFixed(2)} from ${userStableId}`,
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
        amountCents: cents,
        pointsCredited: pts,
        bonusPoints: bonus,
        referralPointsCredited: referralPtsCredited,
        pointsBalance: Number(balance) / 1_000_000,
        tierBefore,
        tierAfter,
        lifetimeSpendCentsBefore,
        lifetimeSpendCentsAfter,
        receiptId: ik,
        bonusReceiptId: bonusLedgerId ? bonusKey : undefined,
        referralReceiptId: referralLedgerId ? refKey : undefined,
      };
    });
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
    const loyaltyConfig = await this.getLoyaltyConfigWithTx(tx);

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

    // 4) lifetimeSpend 调整：settleOnPaid 已加过 baseNet，这里改成 newNet
    const deltaNet = newNetSubtotalCents - baseNetSubtotalCents;
    if (deltaNet !== 0) {
      lifetimeSpendCents = Math.max(0, lifetimeSpendCents + deltaNet);
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

    if (ref0 && ref0.deltaMicro > 0n && baseNetSubtotalCents > 0) {
      const expectedRefNew = this.roundMulDiv(
        ref0.deltaMicro,
        newNetSubtotalCents,
        baseNetSubtotalCents,
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
