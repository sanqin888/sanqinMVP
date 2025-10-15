import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyEntryType } from '@prisma/client';

const MICRO_PER_POINT = 1_000_000n; // 1 pt = 1e6 micro-pts，避免小数误差

// 可通过环境变量调参：$1 赚取多少“点”、1点可抵扣$多少
const EARN_PT_PER_DOLLAR = Number(
  process.env.LOYALTY_EARN_PT_PER_DOLLAR ?? '0.01',
); // $1 → 0.01 pt
const REDEEM_DOLLAR_PER_POINT = Number(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT ?? '0.01',
); // 1 pt → $0.01

// 等级倍率
const TIER_MULTIPLIER: Record<
  'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM',
  number
> = {
  BRONZE: 1.0,
  SILVER: 1.1,
  GOLD: 1.25,
  PLATINUM: 1.5,
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

  /** 确保有账户（无则创建为 BRONZE 0pt） */
  async ensureAccount(userId: string) {
    return this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId, pointsMicro: BigInt(0), tier: 'BRONZE' },
      update: {},
      select: { id: true, userId: true, pointsMicro: true, tier: true },
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

  /** 结算：订单已支付 → 扣减抵扣积分 + 发放赚取积分（幂等） */
  async settleOnPaid(params: {
    orderId: string;
    userId?: string;
    subtotalCents: number; // 原小计（税前、未扣积分）
    redeemValueCents: number; // 本单抵扣掉的“现金价值”，用于反推到底扣了多少点
    taxRate: number; // 例如 0.13
    tier?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  }) {
    const { orderId, userId, subtotalCents, redeemValueCents } = params;
    if (!userId) return; // 匿名单不处理

    await this.prisma.$transaction(async (tx) => {
      // 1) 加锁账户，串行化对同一用户的变更
      const acc =
        (await tx.loyaltyAccount.findUnique({
          where: { userId },
          select: { id: true, pointsMicro: true, tier: true },
        })) ??
        (await tx.loyaltyAccount.create({
          data: { userId, pointsMicro: BigInt(0), tier: 'BRONZE' },
          select: { id: true, pointsMicro: true, tier: true },
        }));
      // 标准 Postgres 行锁
          await tx.$queryRaw`
            SELECT id
            FROM "LoyaltyAccount"
            WHERE id = ${acc.id}::uuid
            FOR UPDATE
      `;


      let balance = acc.pointsMicro;

      // 2) 先处理“抵扣”——以现金抵扣额推回积分（避免新增订单字段）
      const requestedRedeemMicro = toMicroPoints(
        redeemValueCents / 100 / REDEEM_DOLLAR_PER_POINT,
      );

      if (requestedRedeemMicro > 0n) {
        // 幂等：若该单已写过 REDEEM_ON_ORDER，不重复扣
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: { orderId, type: LoyaltyEntryType.REDEEM_ON_ORDER },
          },
          select: { id: true },
        });
        if (!existed) {
          const willDeduct =
            requestedRedeemMicro > balance ? balance : requestedRedeemMicro;
          const newBal = balance - willDeduct;
          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
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

      // 3) 再发放“赚取”
      const tier = acc.tier as 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
      const netSubtotalCents = Math.max(0, subtotalCents - redeemValueCents);
      const earnedPts =
        (netSubtotalCents / 100) * EARN_PT_PER_DOLLAR * TIER_MULTIPLIER[tier];
      const earnedMicro = toMicroPoints(earnedPts);

      if (earnedMicro > 0n) {
        const existed = await tx.loyaltyLedger.findUnique({
          where: {
            orderId_type: { orderId, type: LoyaltyEntryType.REDEEM_ON_ORDER },
          },
          select: { id: true },
        });
        if (!existed) {
          const newBal = balance + earnedMicro;
          await tx.loyaltyLedger.create({
            data: {
              accountId: acc.id,
              orderId,
              type: LoyaltyEntryType.EARN_ON_PURCHASE,
              deltaMicro: earnedMicro,
              balanceAfterMicro: newBal,
              note: `earn on $${(netSubtotalCents / 100).toFixed(2)} @${(EARN_PT_PER_DOLLAR * TIER_MULTIPLIER[tier]).toFixed(4)} pt/$`,
            },
          });
          balance = newBal;
        }
      }

      // 4) 回写账户余额（幂等安全）
      await tx.loyaltyAccount.update({
        where: { id: acc.id },
        data: { pointsMicro: balance },
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
          orderId_type: { orderId, type: LoyaltyEntryType.EARN_ON_PURCHASE },
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
          orderId_type: { orderId, type: LoyaltyEntryType.REDEEM_ON_ORDER },
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
}
