import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { PaymentMethod } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';

const PosManagedCardRefundSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  operatorName: z.string().trim().min(1).max(120),
  refundMethod: z.enum([
    'CASH',
    'CARD',
    'WECHAT_ALIPAY',
    'STORE_BALANCE',
    'UBEREATS',
  ]),
});

type PosManagedCardRefundDto = Omit<
  z.infer<typeof PosManagedCardRefundSchema>,
  'refundMethod'
> & { refundMethod: PaymentMethod };

type PosDeviceRequest = Request & {
  posDevice?: { storeId: string; storeStableId: string };
};

@Controller('pos/payments/card')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosCardRefundController {
  constructor(private readonly refunds: PosCardRefundOrchestrationService) {}

  @Post('orders/:orderStableId/full-refund')
  refundFullOrder(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body(new ZodValidationPipe(PosManagedCardRefundSchema))
    body: PosManagedCardRefundDto,
  ) {
    return this.refunds.refundFullOrder(
      this.requireStoreStableId(req),
      orderStableId,
      body,
    );
  }

  private requireStoreStableId(req: PosDeviceRequest): string {
    const storeStableId = req.posDevice?.storeStableId?.trim();
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return storeStableId;
  }
}
