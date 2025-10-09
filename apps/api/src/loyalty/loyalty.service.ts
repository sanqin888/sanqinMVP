import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';

const MICRO_PER_POINT = 1_000_000; // 1 point = 1e6 micro
const MICRO_PER_CENT = 100; // 0.01 point / $ → 0.0001 / cent → 100 micro

const TIER_MULTIPLIER: Record<$Enums.LoyaltyTier, number> = {
  BRONZE: 1,
  SILVER: 1.2,
  GOLD: 1.5,
  PLATINUM: 2,
};

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 账户查询（如不存在则创建），并返回“可序列化”的账户信息：
   * - points 不是表字段，而是由最新流水的 balanceAfterMicro 计算得出
   */
  async getOrCreateAccount(userId: string) {
    const acc = await this.prisma.loyaltyAccount.upsert({
      where: { userId },
      update: {},
      create: { userId, tier: $Enums.LoyaltyTier.BRONZE },
      select: { id: true, userId: true, tier: true },
    });

    const last = await this.prisma.loyaltyLedger.findFirst({
      where: { accountId: acc.id },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfterMicro: true },
    });

    const points =
      last?.balanceAfterMicro != null
        ? Number(last.balanceAfterMicro) / MICRO_PER_POINT
        : 0;

    // 返回给前端的对象里包含 points（计算值）
    return { userId: acc.userId, tier: acc.tier, points };
  }

  /**
   * 流水列表（BigInt → number，单位 points），避免 JSON 序列化报错 500
   */
  async listLedger(userId: string, limit = 50) {
    const acc = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!acc) {
      // 没账户就先建一个，保持幂等
      await this.getOrCreateAccount(userId);
      return [];
    }

    const rows = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: acc.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        orderId: true,
        deltaMicro: true, // BigInt
        balanceAfterMicro: true, // BigInt
        note: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      type: r.type,
      orderId: r.orderId,
      delta: Number(r.deltaMicro) / MICRO_PER_POINT,
      balance: Number(r.balanceAfterMicro) / MICRO_PER_POINT,
      note: r.note ?? null,
    }));
  }

  /**
   * 兼容旧调用：OrdersService 可能只传了 orderId
   * 从订单里取 userId + subtotalCents，进而记积分
   */
  async creditOnPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, subtotalCents: true },
    });
    if (!order || !order.userId) return;

    await this.earnOnOrderPaid({
      orderId: order.id,
      userId: order.userId,
      subtotalCents: order.subtotalCents,
    });
  }

  /**
   * 规范化的新接口：订单支付成功时按照“不含税小计”累计积分
   */
  async earnOnOrderPaid(params: {
    orderId: string;
    userId: string;
    subtotalCents: number;
  }): Promise<void> {
    // 找或建账户
    const acc = await this.prisma.loyaltyAccount.upsert({
      where: { userId: params.userId },
      update: {},
      create: { userId: params.userId, tier: $Enums.LoyaltyTier.BRONZE },
      select: { id: true, tier: true },
    });

    const multiplier = TIER_MULTIPLIER[acc.tier] ?? 1;
    const baseMicro = params.subtotalCents * MICRO_PER_CENT;
    const earnedMicro = Math.floor(baseMicro * multiplier);

    await this.prisma.$transaction(async (tx) => {
      const last = await tx.loyaltyLedger.findFirst({
        where: { accountId: acc.id },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfterMicro: true },
      });

      const prev = last?.balanceAfterMicro ?? BigInt(0);
      const newBal = prev + BigInt(earnedMicro);

      await tx.loyaltyLedger.create({
        data: {
          accountId: acc.id,
          type: $Enums.LoyaltyEntryType.EARN_ON_PURCHASE,
          orderId: params.orderId,
          deltaMicro: BigInt(earnedMicro),
          balanceAfterMicro: newBal,
          note: 'Earn on paid order',
        },
      });

      // 注意：数据库没有 points 列，不再更新账户 points，仅通过流水余额计算
    });
  }
}
