// apps/api/src/loyalty/loyalty.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';

const MICRO_PER_POINT = 1_000_000;

@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('account')
  async account(@Query('userId') userId: string) {
    const acc = await this.loyalty.ensureAccount(userId);
    return {
      userId: acc.userId,
      tier: acc.tier,
      points: Number(acc.pointsMicro) / MICRO_PER_POINT,
    };
  }

  @Get('ledger')
  async ledger(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const acc = await this.loyalty.ensureAccount(userId);
    const take = Math.min(Math.max(Number(limit ?? 50), 1), 200);

    const rows = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: acc.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        type: true,
        orderId: true,
        deltaMicro: true,
        balanceAfterMicro: true,
        note: true,
      },
    });

    // ✅ orderStableId：优先使用订单稳定号
    const orderIds = Array.from(
      new Set(
        rows
          .map((r) => r.orderId)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );

    const orderStableById = new Map<string, string>();
    if (orderIds.length > 0) {
      const orders = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderStableId: true },
      });
      for (const o of orders) {
        orderStableById.set(o.id, o.orderStableId);
      }
    }

    return rows.map((r) => {
      const orderStableId =
        r.orderId != null
          ? (orderStableById.get(r.orderId) ?? r.orderId)
          : undefined;

      return {
        // ✅ 对外统一：不暴露裸 id
        ledgerId: r.id,

        createdAt: r.createdAt.toISOString(),
        type: r.type,

        // 直接返回“点”（避免前端自己换算）
        deltaPoints: Number(r.deltaMicro) / MICRO_PER_POINT,
        balanceAfterPoints: Number(r.balanceAfterMicro) / MICRO_PER_POINT,

        note: r.note ?? undefined,

        ...(orderStableId ? { orderStableId } : {}),
      };
    });
  }

  /**
   * ⚠️ 仅开发环境使用：给指定 userId 人为加减积分
   * 例：/loyalty/dev/credit?userId=google:123&points=10
   */
  @Get('dev/credit')
  async devCredit(
    @Query('userId') userId: string,
    @Query('points') pointsRaw?: string,
    @Query('note') note?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const points = Number(pointsRaw ?? '0');
    if (!Number.isFinite(points) || points === 0) {
      throw new BadRequestException('points must be a non-zero number');
    }

    await this.loyalty.adjustPointsManual(userId, points, note ?? 'dev credit');

    const acc = await this.loyalty.ensureAccount(userId);
    return {
      userId: acc.userId,
      tier: acc.tier,
      points: Number(acc.pointsMicro) / MICRO_PER_POINT,
    };
  }
}
