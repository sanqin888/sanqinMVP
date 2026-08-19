import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrderFulfillmentTiming } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import type { OrderFulfillmentTimingDto } from './dto/order-fulfillment-timing.dto';
import { OrderPreparationService } from './order-preparation.service';
import { OrderSchedulingQueryService } from './order-scheduling-query.service';

@Controller('orders')
export class ScheduledOrdersController {
  constructor(
    private readonly query: OrderSchedulingQueryService,
    private readonly preparation: OrderPreparationService,
  ) {}

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
