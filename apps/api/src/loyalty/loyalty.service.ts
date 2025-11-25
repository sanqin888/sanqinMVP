import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyEntryType } from '@prisma/client';

const MICRO_PER_POINT = 1_000_000n; // 1 pt = 1e6 micro-pts，避免小数误差

// 可通过环境变量调参：$1 赚取多少“点”、1点可抵扣$多少
const EARN_PT_PER_DOLLAR = Number(
  process.env.LOYALTY_EARN_PT_PER_DOLLAR ?? '0.01',
); // 例如：$1 → 0.01 pt
const REDEEM_DOLLAR_PER_POINT = Number(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT ?? '1',
); // 例如：1 pt → $1

// 等级倍率（你现在的设定）
const TIER_MULTIPLIER: Record<
  'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM',
  number
> = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 5,
};

// 升级门槛（累计实际消费，单位：分）
const TIER_THRESHOLD_CENTS = {
  SILVER: 1000 * 100, // $1,000
  GOLD: 5000 * 100, // $5,000
  PLATINUM: 30000 * 100, // $30,000
};

function toMicroPoints(points: number): bigint {
  // 四舍五入到 micro
  return BigInt(Math.round(points * Number(MICRO_PER_POINT)));
}

function dollarsFromPointsMicro(micro: bigint): number {
  // 以“1点=REDEEM_DOLLAR_PER_POINT 美元”换算
  const pts = Number(micro) / Number(MICRO_PER_POINT);
  return pts * REDEEM_DOLLAR_PER_POINT;
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 确保有账户（无则创建为 BRONZE 0pt，lifetimeSpendCents=0） */
  async ensureAccount(userId: string) {
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

  /** 只读：返回当前余额 micro */
  async peekBalanceMicro(userId: string): Promise<bigint> {
    const acc = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { pointsMicro: true },
    });
    return acc?.pointsMicro ?? BigInt(0);
  }

  /**
   * 结算：订单已支付 → 扣减抵扣积分 + 发放赚取积分 + 更新累计消费 + 自动升级（幂等）
   *
   * subtotalCents: 订单商品原始小计（税前、未扣积分）
   * redeemValueCents: 本单用积分抵掉的“现金价值”
   */
  async settleOnPaid(params: {
    orderId: string;
    userId?: string;
    subtotalCents: number; // 原小计（税前、未扣积分）
    redeemValueCents: number; // 本单抵扣掉的“现金价值”
    taxRate: number; // 例如 0.13
    tier?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'; // 可选：外部传入，默认为账户当前等级
  }) {
    const { orderId, userId, subtotalCents, redeemValueCents } = params;
    if (!userId) return; // 匿名单不处理

    await this.prisma.$transaction(async (tx) => {
      // 1) 加锁账户，串行化对同一用户的变更
      const accRaw =
        (await tx.loyaltyAccount.findUnique({
          where: { userId },
          select: {
            id: true,
            pointsMicro: true,
            tier: true,
            lifetimeSpendCents: true,
          },
        })) ??
        (await tx.loyaltyAccount.create({
          data: {
            userId,
            pointsMicro: BigInt(0),
            tier: 'BRONZE',
            lifetimeSpendCents: 0,
          },
          select: {
            id: true,
            pointsMicro: true,
            tier: true,
            lifetimeSpendCents: true,
          },
        }));

      // 标准 Postgres 行锁
      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${accRaw.id}::uuid
        FOR UPDATE
      `;

      let balance = accRaw.pointsMicro;
      let lifetimeSpendCents = accRaw.lifetimeSpendCents ?? 0;

      // 实际消费额（不含积分抵扣）：用于积分发放 + 等级累积
      const netSubtotalCents = Math.max(0, subtotalCents - redeemValueCents);

      // 2) 先处理“抵扣”——以现金抵扣额推回积分
      const requestedRedeemMicro = toMicroPoints(
        redeemValueCents / 100 / REDEEM_DOLLAR_PER_POINT,
      );

      if (requestedRedeemMicro > 0n) {
        // 幂等：若该单已写过 REDEEM_ON_ORDER，不重复扣
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyEntryType.REDEEM_ON_ORDER,
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
              deltaMicro: -willDeduct,
              balanceAfterMicro: newBal,
              note: `redeem $${(redeemValueCents / 100).toFixed(2)}`,
            },
          });
          balance = newBal;
        }
      }

      // 3) 发放“赚取”积分（基于实际消费 netSubtotalCents）
      const tier = accRaw.tier as 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
      const earnedPts =
        (netSubtotalCents / 100) * EARN_PT_PER_DOLLAR * TIER_MULTIPLIER[tier];
      const earnedMicro = toMicroPoints(earnedPts);

      if (earnedMicro > 0n) {
        // 幂等：检查 EARN_ON_PURCHASE
        const existedEarn = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyEntryType.EARN_ON_PURCHASE,
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
              deltaMicro: earnedMicro,
              balanceAfterMicro: newBal,
              note: `earn on $${(netSubtotalCents / 100).toFixed(2)} @${(
                EARN_PT_PER_DOLLAR * TIER_MULTIPLIER[tier]
              ).toFixed(4)} pt/$`,
            },
          });
          balance = newBal;
        }
      }

      // 4) 累加“累计实际消费”：订单实际消费（不含积分抵扣）
      lifetimeSpendCents += netSubtotalCents;

      // 5) 根据累计消费决定是否升级等级
      let newTier = tier;
      if (lifetimeSpendCents >= TIER_THRESHOLD_CENTS.PLATINUM) {
        newTier = 'PLATINUM';
      } else if (lifetimeSpendCents >= TIER_THRESHOLD_CENTS.GOLD) {
        newTier = 'GOLD';
      } else if (lifetimeSpendCents >= TIER_THRESHOLD_CENTS.SILVER) {
        newTier = 'SILVER';
      } else {
        newTier = 'BRONZE';
      }

      // 6) 回写账户余额 + 等级 + 累计消费（幂等安全）
      await tx.loyaltyAccount.update({
        where: { id: accRaw.id },
        data: {
          pointsMicro: balance,
          tier: newTier,
          lifetimeSpendCents,
        },
      });
    });
  }

  /** 退款：冲回赚取、返还抵扣（幂等） */
  async rollbackOnRefund(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order?.userId) return;

    await this.prisma.$transaction(async (tx) => {
      const acc = await this.ensureAccount(order.userId!);

      await tx.$queryRaw`
        SELECT id
        FROM "LoyaltyAccount"
        WHERE id = ${acc.id}::uuid
        FOR UPDATE
      `;

      let balance = acc.pointsMicro;

      // 1) 如果有“赚取”，做反向抵扣
      const earn = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type: {
            orderId,
            type: LoyaltyEntryType.EARN_ON_PURCHASE,
          },
        },
        select: { deltaMicro: true },
      });
      if (earn && earn.deltaMicro > 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyEntryType.REFUND_REVERSE_EARN,
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
              deltaMicro: -earn.deltaMicro,
              balanceAfterMicro: newBal,
              note: 'reverse earned on refund',
            },
          });
          balance = newBal;
        }
      }

      // 2) 如果有“抵扣”，把抵扣的积分退回
      const redeem = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type: {
            orderId,
            type: LoyaltyEntryType.REDEEM_ON_ORDER,
          },
        },
        select: { deltaMicro: true },
      });
      if (redeem && redeem.deltaMicro < 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: {
              orderId,
              type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
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
              deltaMicro: back,
              balanceAfterMicro: newBal,
              note: 'return redeemed on refund',
            },
          });
          balance = newBal;
        }
      }

      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: { pointsMicro: balance },
      });
    });
  }

  /** 工具：把“可抵扣的积分余额（micro）”换算成“最大可抵扣金额（分）” */
  maxRedeemableCentsFromBalance(micro: bigint): number {
    const dollars = dollarsFromPointsMicro(micro); // 可抵扣美元
    return Math.floor(dollars * 100);
  }

  /**
   * 充值：顾客储值 → 增加积分余额 + 累计消费
   * 默认规则：1 CAD 储值 = 1 积分
   * 奖励积分请通过 adjustPointsManual 手动写账（例如送 20 pt）
   */
  async applyTopup(
    userId: string,
    amountCents: number,
    pointsToCredit?: number,
  ) {
    if (!userId || amountCents <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      const acc = await this.ensureAccount(userId);

      const pts =
        typeof pointsToCredit === 'number' ? pointsToCredit : amountCents / 100; // 默认：$100 → 100 pt

      const deltaMicro = toMicroPoints(pts);
      const newBal = acc.pointsMicro + deltaMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId: null,
          type: LoyaltyEntryType.TOPUP_PURCHASED,
          deltaMicro,
          balanceAfterMicro: newBal,
          note: `topup $${(amountCents / 100).toFixed(2)} → ${pts.toFixed(
            2,
          )} pts`,
        },
      });

      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: {
          pointsMicro: newBal,
          // 你刚才的决定：充值也算累计消费
          lifetimeSpendCents: { increment: amountCents },
        },
      });
    });
  }

  /**
   * 手动调账：例如活动奖励、客服补偿等
   * deltaPoints 可正可负
   */
  async adjustPointsManual(userId: string, deltaPoints: number, note?: string) {
    if (!userId || deltaPoints === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const acc = await this.ensureAccount(userId);

      const deltaMicro = toMicroPoints(deltaPoints);
      const newBal = acc.pointsMicro + deltaMicro;

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          orderId: null,
          type: LoyaltyEntryType.ADJUSTMENT_MANUAL,
          deltaMicro,
          balanceAfterMicro: newBal,
          note: note ?? 'manual adjustment',
        },
      });

      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: { pointsMicro: newBal },
      });
    });
  }
}
