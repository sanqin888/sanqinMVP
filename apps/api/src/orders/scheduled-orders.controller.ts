import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { OrderFulfillmentTiming } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import type { OrderFulfillmentTimingDto } from './dto/order-fulfillment-timing.dto';
import type { ScheduledOrdersQueueDto } from './dto/scheduled-order-summary.dto';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';

type PosDeviceRequest = Request & {
  posDevice?: { storeId: string };
};

@Controller('orders')
export class ScheduledOrdersController {
  constructor(
    private readonly query: OrderSchedulingQueryService,
    private readonly preparation: OrderPreparationService,
  ) {}

  @Get('scheduled')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async listScheduledOrders(
    @Req() req: PosDeviceRequest,
  ): Promise<ScheduledOrdersQueueDto> {
    const deviceStoreId = req.posDevice?.storeId;
    if (!deviceStoreId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return {
      orders: await this.query.listUpcomingForDeviceStore(deviceStoreId),
    };
  }

  @Get(':orderStableId/fulfillment-timing')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async getFulfillmentTiming(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderFulfillmentTimingDto> {
    return this.requireTiming(orderStableId);
  }

  /** Manual early-start uses the same command as the durable scheduler. */
  @Post(':orderStableId/preparation/start')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async startPreparationEarly(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderFulfillmentTimingDto> {
    const current = await this.requireTiming(orderStableId);
    if (current.fulfillmentTiming !== OrderFulfillmentTiming.SCHEDULED) {
      throw new BadRequestException('order is not scheduled');
    }
    await this.preparation.activateScheduledOrderByStableId(orderStableId);
    return this.requireTiming(orderStableId);
  }

  private async requireTiming(
    orderStableId: string,
  ): Promise<OrderFulfillmentTimingDto> {
    const timing = await this.query.findByStableId(orderStableId);
    if (!timing) throw new NotFoundException('order not found');
    return timing;
  }
}
