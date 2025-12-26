// apps/api/src/loyalty/loyalty.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

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
      points: Number(acc.pointsMicro) / 1_000_000,
    };
  }

  /**
   * 顾客储值：增加积分 + 累计消费 + 自动升级
   */
  @Post('topup')
  async topup(
    @Body()
    body: {
      userId?: string;
      amountCents?: number;
      pointsToCredit?: number;
    },
  ) {
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const amountCentsRaw = body.amountCents;
    const amountCents =
      typeof amountCentsRaw === 'number' ? Math.round(amountCentsRaw) : NaN;

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive number');
    }

    const pointsToCredit =
      typeof body.pointsToCredit === 'number' ? body.pointsToCredit : undefined;

    await this.loyalty.applyTopup(userId, amountCents, pointsToCredit);

    const acc = await this.loyalty.ensureAccount(userId);
    return {
      userId: acc.userId,
      tier: acc.tier,
      points: Number(acc.pointsMicro) / 1_000_000,
      lifetimeSpendCents: acc.lifetimeSpendCents ?? 0,
    };
  }
}
