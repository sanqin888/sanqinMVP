// apps/api/src/pos/pos-orders.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  DefaultValuePipe,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  StableIdPipe,
  ZodValidationPipe,
  type AuthenticatedPosIdentity,
} from './public-api';
import { PosDeviceGuard } from './pos-device.guard';
import { CreateOrderSchema } from '@shared/order';
import type { CreateOrderInput, OrderStatus } from '@shared/order';
import {
  POS_ORDER_OPERATIONS,
  type PosOrderDto,
  type PosOrderFulfillmentTimingDto,
  type PosOrderJsonInput,
  type PosOrderOperationsPort,
} from '../orders/public-api';
import {
  OrderAmendmentItemAction,
  OrderAmendmentType,
  PaymentMethod,
} from '@prisma/client';
import type { PrintPosPayloadDto } from './dto/print-pos-payload.dto';
import { PrintPosPayloadService } from '../orders/print-pos-payload.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PosCardPaymentFeatureConfig } from './pos-card-payment-feature.config';
import { PosGateway } from './pos.gateway';
import { PosOrdersService } from './pos-orders.service';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

type PosDeviceRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

type PosBoardOrderDto = PosOrderDto & {
  fulfillmentTiming: 'IMMEDIATE' | 'SCHEDULED';
};

class CancelUberOrderDto {
  @IsString()
  @IsIn([
    'ITEM_ISSUE',
    'STORE_CLOSED',
    'CAPACITY',
    'SPECIAL_INSTRUCTIONS',
    'POS_OFFLINE',
    'TECHNICAL_FAILURE',
    'OTHER',
  ])
  reasonCode!: string;

  @IsOptional()
  @IsString()
  reasonDetail?: string;
}

class DenyUberOrderDto {
  @IsString()
  @IsIn([
    'ITEM_ISSUE',
    'STORE_CLOSED',
    'CAPACITY',
    'SPECIAL_INSTRUCTIONS',
    'POS_OFFLINE',
    'TECHNICAL_FAILURE',
    'OTHER',
  ])
  reasonCode!: string;

  @IsOptional()
  @IsString()
  reasonDetail?: string;
}

class UpdateAutoAcceptOnlineOrdersDto {
  @IsBoolean()
  enabled!: boolean;
}

class CreateAmendmentItemDto {
  @IsEnum(OrderAmendmentItemAction)
  action!: OrderAmendmentItemAction;

  @IsString()
  productStableId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unitPriceCents?: number | null;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsString()
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  nameZh?: string | null;

  @IsOptional()
  optionsJson?: PosOrderJsonInput;
}

class CreatePosAmendmentDto {
  @IsEnum(OrderAmendmentType)
  type!: OrderAmendmentType;

  @IsString()
  reason!: string;

  @IsString()
  operatorName!: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refundGrossCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  additionalChargeCents?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAmendmentItemDto)
  items?: CreateAmendmentItemDto[];

  @IsOptional()
  @IsIn(['zh', 'en'])
  locale?: 'zh' | 'en';
}

@Controller('pos/orders')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosOrdersController {
  constructor(
    @Inject(POS_ORDER_OPERATIONS)
    private readonly orders: PosOrderOperationsPort,
    private readonly printPosPayloadService: PrintPosPayloadService,
    private readonly eventEmitter: EventEmitter2,
    private readonly posGateway: PosGateway,
    private readonly posOrders: PosOrdersService,
    private readonly posCardPaymentFeature: PosCardPaymentFeatureConfig,
  ) {}

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateOrderSchema))
  async create(
    @Req() req: PosDeviceRequest,
    @Body() dto: CreateOrderInput,
  ): Promise<PosOrderDto> {
    if (dto.channel !== 'in_store' && dto.channel !== 'ubereats') {
      throw new BadRequestException(
        'POS orders must use channel=in_store|ubereats',
      );
    }
    if (!dto.paymentMethod) {
      throw new BadRequestException('POS orders must provide paymentMethod');
    }
    if (dto.channel === 'ubereats' && dto.paymentMethod !== 'UBEREATS') {
      throw new BadRequestException(
        'UberEats channel orders must use paymentMethod=UBEREATS',
      );
    }
    if (
      dto.channel === 'in_store' &&
      dto.paymentMethod === 'CARD' &&
      this.posCardPaymentFeature.isEnabled()
    ) {
      throw new ConflictException({
        code: 'POS_CLOVER_TERMINAL_PAYMENT_REQUIRED',
        message:
          'Legacy POS card order creation is disabled while Clover Terminal payments are enabled.',
      });
    }

    return this.orders.createForStore(dto, this.requireStoreStableId(req));
  }

  @Get('recent')
  recent(
    @Req() req: PosDeviceRequest,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PosOrderDto[]> {
    return this.orders.recent(this.requireStoreStableId(req), limit);
  }

  @Get('board')
  async board(
    @Req() req: PosDeviceRequest,
    @Query('status') statusRaw?: string,
    @Query('channel') channelRaw?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sinceMinutes', new DefaultValuePipe(1440), ParseIntPipe)
    sinceMinutes?: number,
  ): Promise<PosBoardOrderDto[]> {
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

    const storeStableId = this.requireStoreStableId(req);

    const [boardOrders, upcomingScheduledOrders] = await Promise.all([
      this.orders.board(storeStableId, {
        statusIn,
        channelIn,
        limit,
        sinceMinutes,
      }),
      this.orders.listUpcomingScheduledForStore(storeStableId),
    ]);
    const timings = await this.orders.getFulfillmentTimingsForStore(
      boardOrders.map((order) => order.orderStableId),
      storeStableId,
    );

    const upcomingScheduledIds = new Set(
      upcomingScheduledOrders.map((order) => order.orderStableId),
    );

    return boardOrders
      .filter((order) => !upcomingScheduledIds.has(order.orderStableId))
      .map((order) => ({
        ...order,
        fulfillmentTiming: timings.get(order.orderStableId) ?? 'IMMEDIATE',
      }));
  }

  @Get('scheduled')
  async listScheduledOrders(@Req() req: PosDeviceRequest) {
    return {
      orders: await this.orders.listUpcomingScheduledForStore(
        this.requireStoreStableId(req),
      ),
    };
  }

  @Get(':orderStableId/fulfillment-timing')
  getFulfillmentTiming(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    return this.requireFulfillmentTiming(
      this.requireStoreStableId(req),
      orderStableId,
    );
  }

  @Post(':orderStableId/preparation/start')
  @HttpCode(200)
  async startPreparationEarly(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    const storeStableId = this.requireStoreStableId(req);
    const current = await this.requireFulfillmentTiming(
      storeStableId,
      orderStableId,
    );
    if (current.fulfillmentTiming !== 'SCHEDULED') {
      throw new BadRequestException('order is not scheduled');
    }
    await this.orders.activateScheduledPreparation(
      orderStableId,
      storeStableId,
    );
    return this.requireFulfillmentTiming(storeStableId, orderStableId);
  }

  @Get('settings/auto-accept')
  getAutoAcceptOnlineOrders(@Req() req: PosDeviceRequest) {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return this.posOrders.getAutoAcceptOnlineOrders(storeStableId);
  }

  @Patch('settings/auto-accept')
  setAutoAcceptOnlineOrders(
    @Req() req: PosDeviceRequest,
    @Body() body: UpdateAutoAcceptOnlineOrdersDto,
  ) {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return this.posOrders.setAutoAcceptOnlineOrders(
      storeStableId,
      body.enabled,
    );
  }

  @Get(':orderStableId')
  findOne(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderDto> {
    return this.orders.getByStableIdForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
  }

  @Get(':orderStableId/actions')
  getActions(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ) {
    return this.posOrders.getManagementActions(
      this.requireStoreStableId(req),
      orderStableId,
    );
  }

  @Get(':orderStableId/amendments')
  listAmendments(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ) {
    return this.posOrders.listAmendments(
      this.requireStoreStableId(req),
      orderStableId,
    );
  }

  @Get(':orderStableId/print-payload')
  async getPrintPayload(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Query('locale') locale?: string,
  ): Promise<PrintPosPayloadDto> {
    await this.orders.getByStableIdForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
    return this.printPosPayloadService.getByStableId(orderStableId, locale);
  }

  @Get(':orderStableId/print-status')
  async getPrintStatus(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ) {
    await this.orders.getByStableIdForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
    return this.posGateway.getOrderPrintStatus(orderStableId);
  }

  @Post(':orderStableId/print')
  @HttpCode(200)
  async reprint(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body()
    body?: {
      locale?: 'zh' | 'en';
      targets?: { customer?: boolean; kitchen?: boolean; label?: boolean };
      cashReceivedCents?: number;
      cashChangeCents?: number;
    },
  ) {
    await this.orders.getByStableIdForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
    this.eventEmitter.emit('order.reprint', {
      orderStableId,
      locale: body?.locale === 'en' ? 'en' : 'zh',
      targets: {
        customer: body?.targets?.customer ?? true,
        kitchen: body?.targets?.kitchen ?? false,
        label: body?.targets?.label ?? false,
      },
      ...(typeof body?.cashReceivedCents === 'number'
        ? { cashReceivedCents: Math.max(0, Math.round(body.cashReceivedCents)) }
        : {}),
      ...(typeof body?.cashChangeCents === 'number'
        ? { cashChangeCents: Math.max(0, Math.round(body.cashChangeCents)) }
        : {}),
    });
    return { success: true };
  }

  @Patch(':orderStableId/status')
  updateStatus(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: { status: OrderStatus },
  ): Promise<PosOrderDto> {
    return this.orders.updateStatusForStore(
      orderStableId,
      this.requireStoreStableId(req),
      body.status,
    );
  }

  @Post(':orderStableId/advance')
  @HttpCode(200)
  advance(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ) {
    return this.posOrders.advance(
      this.requireStoreStableId(req),
      orderStableId,
    );
  }

  @Post(':orderStableId/uber-sync/retry')
  @HttpCode(200)
  retryUberSync(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ) {
    return this.posOrders.retryUberSync(
      this.requireStoreStableId(req),
      orderStableId,
    );
  }

  @Post(':orderStableId/uber-deny')
  @HttpCode(202)
  denyUberOrder(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: DenyUberOrderDto,
  ) {
    return this.posOrders.denyUberOrder(
      this.requireStoreStableId(req),
      orderStableId,
      body.reasonCode,
      body.reasonDetail,
    );
  }

  @Post(':orderStableId/uber-cancel')
  @HttpCode(202)
  cancelUberOrder(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: CancelUberOrderDto,
  ) {
    return this.posOrders.cancelUberOrder(
      this.requireStoreStableId(req),
      orderStableId,
      body.reasonCode,
      body.reasonDetail,
    );
  }

  @Post(':orderStableId/amendments')
  @HttpCode(201)
  async createAmendment(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: CreatePosAmendmentDto,
  ): Promise<PosOrderDto> {
    const items = body.items ?? [];
    const updated = await this.posOrders.createAmendment(
      this.requireStoreStableId(req),
      orderStableId,
      {
        type: body.type,
        reason: body.reason,
        operatorName: body.operatorName,
        paymentMethod: body.paymentMethod ?? null,
        refundGrossCents: body.refundGrossCents ?? 0,
        additionalChargeCents: body.additionalChargeCents ?? 0,
        items,
      },
    );

    if (
      body.type === OrderAmendmentType.VOID_ITEM ||
      body.type === OrderAmendmentType.SWAP_ITEM
    ) {
      this.eventEmitter.emit('order.amendment.print', {
        orderStableId,
        locale: body.locale ?? 'zh',
        reason: body.reason,
        operatorName: body.operatorName,
        items,
      });
    }

    return updated;
  }

  private async requireFulfillmentTiming(
    storeStableId: string,
    orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    const timing = await this.orders.getFulfillmentTimingForStore(
      orderStableId,
      storeStableId,
    );
    if (!timing) {
      throw new NotFoundException('order not found');
    }
    return timing;
  }

  private requireStoreStableId(req: PosDeviceRequest): string {
    const storeStableId = req.posDevice?.storeStableId?.trim();
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return storeStableId;
  }
}
