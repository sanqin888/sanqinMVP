import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { CreateOrderSchema } from '@shared/order';
import type { Request } from 'express';
import { z } from 'zod';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const PosCardPaymentStartSchema = z.object({
  attemptId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128),
  order: CreateOrderSchema,
});

type PosCardPaymentStartDto = z.infer<typeof PosCardPaymentStartSchema>;

type PosDeviceRequest = Request & {
  posDevice?: { storeId: string };
};

@Controller('pos/payments/card')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosCardPaymentController {
  constructor(
    private readonly cardPayments: PosCardPaymentOrchestrationService,
  ) {}

  @Get('config')
  getConfig(@Req() req: PosDeviceRequest) {
    return this.cardPayments.getConfig(this.requireStoreId(req));
  }

  @Get('availability')
  getAvailability(@Req() req: PosDeviceRequest) {
    return this.cardPayments.getAvailability(this.requireStoreId(req));
  }

  @Post('start')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  start(@Req() req: PosDeviceRequest, @Body() body: PosCardPaymentStartDto) {
    return this.cardPayments.start(this.requireStoreId(req), body);
  }

  @Post('recover')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  recover(@Req() req: PosDeviceRequest, @Body() body: PosCardPaymentStartDto) {
    return this.cardPayments.recover(this.requireStoreId(req), body);
  }

  @Post(':attemptId/cancel')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  cancel(
    @Req() req: PosDeviceRequest,
    @Param('attemptId') attemptId: string,
    @Body() body: PosCardPaymentStartDto,
  ) {
    if (body.attemptId !== attemptId) {
      throw new BadRequestException({
        code: 'POS_CARD_PAYMENT_ATTEMPT_MISMATCH',
        message: 'Path attemptId must match the saved payment request.',
      });
    }
    return this.cardPayments.cancel(this.requireStoreId(req), body);
  }

  private requireStoreId(req: PosDeviceRequest): string {
    const storeId = req.posDevice?.storeId?.trim();
    if (!storeId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return storeId;
  }
}
