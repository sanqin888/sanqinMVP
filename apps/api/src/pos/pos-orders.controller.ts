//apps/api/src/pos/pos-orders.controller.ts
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from './pos-device.guard';
import { OrdersService } from '../orders/orders.service';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { CreateOrderSchema } from '@shared/order';
import type { CreateOrderInput } from '@shared/order';
import type { OrderStatus } from '../orders/order-status';
import { OrderAmendmentType, PaymentMethod } from '@prisma/client';
import type { OrderDto } from '../orders/dto/order.dto';
import type { PrintPosPayloadDto } from './dto/print-pos-payload.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrintPosPayloadService } from '../orders/print-pos-payload.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('pos/orders')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly printPosPayloadService: PrintPosPayloadService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateOrderSchema))
  async create(@Body() dto: CreateOrderInput): Promise<OrderDto> {
    if (dto.channel !== 'in_store' && dto.channel !== 'ubereats') {
      throw new BadRequestException('POS orders must use channel=in_store|ubereats');
    }
    if (!dto.paymentMethod) {
      throw new BadRequestException('POS orders must provide paymentMethod');
    }
    if (dto.channel === 'ubereats' && dto.paymentMethod !== 'UBEREATS') {
      throw new BadRequestException(
        'UberEats channel orders must use paymentMethod=UBEREATS',
      );
    }
    return this.orders.create(dto);
  }

  @Get('recent')
  recent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<OrderDto[]> {
    return this.orders.recent(limit);
  }

  @Get('board')
  board(
    @Query('status') statusRaw?: string,
    @Query('channel') channelRaw?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sinceMinutes', new DefaultValuePipe(1440), ParseIntPipe)
    sinceMinutes?: number,
  ): Promise<OrderDto[]> {
    const statusIn = statusRaw
      ? (statusRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean) as OrderStatus[])
      : undefined;

    const channelIn = channelRaw
      ? (channelRaw
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean) as Array<'web' | 'in_store' | 'ubereats'>)
      : undefined;

    return this.orders.board({ statusIn, channelIn, limit, sinceMinutes });
  }

  @Get(':orderStableId')
  findOne(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderDto> {
    return this.orders.getByStableId(orderStableId);
  }

  @Get(':orderStableId/print-payload')
  getPrintPayload(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Query('locale') locale?: string,
  ): Promise<PrintPosPayloadDto> {
    return this.printPosPayloadService.getByStableId(orderStableId, locale);
  }

  @Post(':orderStableId/print')
  @HttpCode(200)
  reprint(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body?: { targets?: { customer?: boolean; kitchen?: boolean } },
  ) {
    this.eventEmitter.emit('order.reprint', {
      orderStableId,
      targets: {
        customer: body?.targets?.customer ?? true,
        kitchen: body?.targets?.kitchen ?? false,
      },
    });
    return { success: true };
  }

  @Patch(':orderStableId/status')
  updateStatus(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: { status: OrderStatus },
  ): Promise<OrderDto> {
    return this.orders.updateStatus(orderStableId, body.status);
  }

  @Post(':orderStableId/advance')
  @HttpCode(200)
  advance(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderDto> {
    return this.orders.advance(orderStableId);
  }

  @Post(':orderStableId/amendments')
  @HttpCode(201)
  createAmendment(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body()
    body: {
      type: OrderAmendmentType;
      reason: string;
      paymentMethod?: PaymentMethod | null;
      refundGrossCents?: number;
      additionalChargeCents?: number;
      items?: any[];
    },
  ): Promise<OrderDto> {
    // 这里直接复用你现有 service 的 createAmendment
    return this.orders.createAmendment({
      orderStableId,
      type: body.type,
      reason: body.reason,
      paymentMethod: body.paymentMethod ?? null,
      refundGrossCents: body.refundGrossCents ?? 0,
      additionalChargeCents: body.additionalChargeCents ?? 0,
      items: body.items ?? [],
    });
  }
}
