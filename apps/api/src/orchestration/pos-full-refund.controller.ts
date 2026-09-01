import {
  Body,
  Controller,
  HttpCode,
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
import type { AuthenticatedPosIdentity } from '../pos/public-api';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import type { PosCreateFullRefundInput } from '../pos/pos-orders.service';
import { PosFullRefundOrchestrationService } from './pos-full-refund-orchestration.service';

const PaymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'WECHAT_ALIPAY',
  'STORE_BALANCE',
  'UBEREATS',
]);

const PosFullRefundSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  operatorName: z.string().trim().min(1).max(120),
  refundAmountCents: z.number().int().nonnegative(),
  originalPaymentMethod: PaymentMethodSchema,
  refundMethod: PaymentMethodSchema,
});

type PosFullRefundDto = Omit<
  z.infer<typeof PosFullRefundSchema>,
  'originalPaymentMethod' | 'refundMethod'
> & {
  originalPaymentMethod: PaymentMethod;
  refundMethod: PaymentMethod;
};

type PosDeviceRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

@Controller('pos/orders')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosFullRefundController {
  constructor(private readonly refunds: PosFullRefundOrchestrationService) {}

  @Post(':orderStableId/full-refund')
  @HttpCode(201)
  fullRefund(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body(new ZodValidationPipe(PosFullRefundSchema)) body: PosFullRefundDto,
  ) {
    return this.refunds.refundFullOrder(
      this.requireStoreStableId(req),
      orderStableId,
      body as PosCreateFullRefundInput,
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
