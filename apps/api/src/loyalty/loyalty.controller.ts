import { Controller, Get, Query } from '@nestjs/common';
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
}
