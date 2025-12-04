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

    // 直接返回“点”（避免前端自己换算）
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      type: r.type,
      orderId: r.orderId,
      deltaPoints: Number(r.deltaMicro) / MICRO_PER_POINT,
      balanceAfterPoints: Number(r.balanceAfterMicro) / MICRO_PER_POINT,
      note: r.note,
    }));
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
