import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminMfaGuard,
  Roles,
  RolesGuard,
  SessionAuthGuard,
} from '../auth/public-api';
import type { OrderDeliveryDispatchReconciliationAction } from './order-delivery-dispatch-journal';
import {
  OrderDeliveryDispatchReconciliationError,
  OrderDeliveryDispatchReconciliationService,
} from './order-delivery-dispatch-reconciliation.service';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/orders/delivery-dispatch')
export class AdminOrderDeliveryDispatchController {
  constructor(
    private readonly reconciliation: OrderDeliveryDispatchReconciliationService,
  ) {}

  @Get('reconciliation')
  async list(@Query('limit') limitRaw?: string) {
    const parsed = Number(limitRaw);
    const limit = Number.isFinite(parsed) ? parsed : 50;
    return this.reconciliation.listQueue(limit);
  }

  @Post(':orderStableId/reconcile')
  async reconcile(
    @Req() req: { user?: { userStableId?: string } },
    @Param('orderStableId') orderStableId: string,
    @Body()
    body: {
      attempt?: number;
      action?: OrderDeliveryDispatchReconciliationAction;
      providerDeliveryId?: string;
      note?: string;
    },
  ) {
    const operatorUserStableId = req.user?.userStableId?.trim();
    if (!operatorUserStableId) {
      throw new BadRequestException('Missing operator');
    }
    if (
      body.action !== 'BIND_EXISTING' &&
      body.action !== 'CONFIRM_NOT_CREATED_RETRY'
    ) {
      throw new BadRequestException('Invalid reconciliation action');
    }

    try {
      return await this.reconciliation.reconcile({
        orderStableId,
        attempt: body.attempt ?? 0,
        action: body.action,
        operatorUserStableId,
        providerDeliveryId: body.providerDeliveryId,
        note: body.note,
      });
    } catch (error) {
      if (!(error instanceof OrderDeliveryDispatchReconciliationError)) {
        throw error;
      }
      if (error.code === 'NOT_FOUND') {
        throw new NotFoundException(error.message);
      }
      if (
        error.code === 'STALE_ATTEMPT' ||
        error.code === 'NOT_RECONCILABLE' ||
        error.code === 'ORDER_ALREADY_BOUND' ||
        error.code === 'ORDER_NOT_RETRYABLE'
      ) {
        throw new ConflictException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }
}
