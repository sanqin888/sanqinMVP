// apps/api/src/loyalty/loyalty.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import { LoyaltyService } from './loyalty.service';

@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  private readIdempotencyKey(headerValue: unknown, bodyValue: unknown): string {
    const h = typeof headerValue === 'string' ? headerValue.trim() : '';
    const b = typeof bodyValue === 'string' ? bodyValue.trim() : '';
    const ik = h || b;

    if (!ik) throw new BadRequestException('idempotencyKey is required');
    if (ik.length > 128) {
      throw new BadRequestException('idempotencyKey is too long');
    }
    return ik;
  }

  /**
   * POS 充值：充值积分 +（可选）人工奖励积分 + 累计消费 + 自动升级 + 推荐人奖励
   */
  @Post('topup')
  async topup(
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body()
    body: {
      userStableId?: string;
      amountCents?: number;
      pointsToCredit?: number; // 可选：覆盖默认 1 CAD = 1 pt
      bonusPoints?: number; // 可选：人工额外奖励
      idempotencyKey?: string; // 允许 body 传（curl 更方便）
    },
  ) {
    const userStableId =
      typeof body.userStableId === 'string' ? body.userStableId.trim() : '';
    if (!userStableId)
      throw new BadRequestException('userStableId is required');

    const amountCents =
      typeof body.amountCents === 'number' ? Math.round(body.amountCents) : NaN;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive number');
    }

    const pointsToCredit =
      typeof body.pointsToCredit === 'number' ? body.pointsToCredit : undefined;

    const bonusPoints =
      typeof body.bonusPoints === 'number' ? body.bonusPoints : undefined;

    const idempotencyKey = this.readIdempotencyKey(
      idempotencyKeyHeader,
      body.idempotencyKey,
    );

    const result = await this.loyalty.applyTopup({
      userStableId,
      amountCents,
      pointsToCredit,
      bonusPoints,
      idempotencyKey,
    });

    return { userStableId, ...result };
  }

  /**
   * POS 手动调账：独立的加/减积分（幂等）
   */
  @Post('adjust-manual')
  async adjustManual(
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Body()
    body: {
      userStableId?: string;
      deltaPoints?: number; // 可正可负
      note?: string;
      idempotencyKey?: string;
    },
  ) {
    const userStableId =
      typeof body.userStableId === 'string' ? body.userStableId.trim() : '';
    if (!userStableId)
      throw new BadRequestException('userStableId is required');

    const deltaPoints =
      typeof body.deltaPoints === 'number' ? body.deltaPoints : NaN;
    if (!Number.isFinite(deltaPoints) || deltaPoints === 0) {
      throw new BadRequestException('deltaPoints must be a non-zero number');
    }

    const note = typeof body.note === 'string' ? body.note.trim() : undefined;

    const idempotencyKey = this.readIdempotencyKey(
      idempotencyKeyHeader,
      body.idempotencyKey,
    );

    const result = await this.loyalty.adjustPointsManual({
      userStableId,
      deltaPoints,
      note,
      idempotencyKey,
    });

    return { userStableId, ...result };
  }
}
