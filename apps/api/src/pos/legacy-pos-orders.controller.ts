import {
  BadRequestException,
  Body,
  Controller,
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
} from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import {
  OrderAmendmentItemAction,
  OrderAmendmentType,
  OrderStatus as PrismaOrderStatus,
  PaymentMethod,
} from '@prisma/client';
import type { OrderStatus } from '@shared/order';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { StableIdPipe } from './pos-http-validation';
import {
  POS_ORDER_OPERATIONS,
  type PosOrderDto,
  type PosOrderFulfillmentTimingDto,
  type PosOrderJsonInput,
  type PosOrderOperationsPort,
} from '../orders/public-api';
import type { AuthenticatedPosIdentity } from './public-api';
import { PosDeviceGuard } from './pos-device.guard';

type PosDeviceRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

class LegacyUpdateStatusDto {
  @IsEnum(PrismaOrderStatus)
  status!: OrderStatus;
}

class LegacyCreateOrderAmendmentItemDto {
  @IsEnum(OrderAmendmentItemAction)
  action!: OrderAmendmentItemAction;

  @IsString()
  productStableId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
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

@ValidatorConstraint({ name: 'LegacyAmendmentRequestConsistency', async: false })
class LegacyAmendmentRequestConsistency
  implements ValidatorConstraintInterface
{
  validate(type: OrderAmendmentType, args: ValidationArguments): boolean {
    const dto = args.object as LegacyCreateOrderAmendmentDto;
    const items = Array.isArray(dto.items) ? dto.items : [];
    const refund = Number.isFinite(dto.refundGrossCents)
      ? Math.max(0, Math.round(dto.refundGrossCents as number))
      : 0;
    const charge = Number.isFinite(dto.additionalChargeCents)
      ? Math.max(0, Math.round(dto.additionalChargeCents as number))
      : 0;
    const hasVoid = items.some(
      (item) => item.action === OrderAmendmentItemAction.VOID,
    );
    const hasAdd = items.some(
      (item) => item.action === OrderAmendmentItemAction.ADD,
    );

    if (refund > 0 && charge > 0) return false;

    switch (type) {
      case OrderAmendmentType.RETENDER:
        return items.length === 0 && (refund > 0 || charge > 0);
      case OrderAmendmentType.VOID_ITEM:
        return items.length > 0 && hasVoid && !hasAdd && refund > 0 && charge === 0;
      case OrderAmendmentType.SWAP_ITEM:
        return items.length > 0 && hasVoid && hasAdd;
      case OrderAmendmentType.ADDITIONAL_CHARGE:
        return !hasVoid && charge > 0 && refund === 0;
      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as LegacyCreateOrderAmendmentDto;
    const items = Array.isArray(dto.items) ? dto.items : [];
    const refund = Number.isFinite(dto.refundGrossCents)
      ? Math.max(0, Math.round(dto.refundGrossCents as number))
      : 0;
    const charge = Number.isFinite(dto.additionalChargeCents)
      ? Math.max(0, Math.round(dto.additionalChargeCents as number))
      : 0;

    if (refund > 0 && charge > 0) {
      return 'refundGrossCents and additionalChargeCents cannot both be > 0';
    }

    switch (dto.type) {
      case OrderAmendmentType.RETENDER:
        return 'RETENDER requires items to be empty, and refundGrossCents > 0 OR additionalChargeCents > 0';
      case OrderAmendmentType.VOID_ITEM:
        return 'VOID_ITEM requires non-empty items with action=VOID only, and refundGrossCents > 0';
      case OrderAmendmentType.SWAP_ITEM:
        return 'SWAP_ITEM requires non-empty items including both action=VOID and action=ADD';
      case OrderAmendmentType.ADDITIONAL_CHARGE:
        return 'ADDITIONAL_CHARGE requires additionalChargeCents > 0, and items must not include action=VOID';
      default:
        return `invalid amendment request: type=${String(dto.type)} items=${items.length} refund=${refund} charge=${charge}`;
    }
  }
}

class LegacyCreateOrderAmendmentDto {
  @IsEnum(OrderAmendmentType)
  @Validate(LegacyAmendmentRequestConsistency)
  type!: OrderAmendmentType;

  @IsString()
  reason!: string;

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
  @Type(() => LegacyCreateOrderAmendmentItemDto)
  items?: LegacyCreateOrderAmendmentItemDto[];
}

// @compat orders.pos-transport-routes.v1
@Controller('orders')
export class LegacyPosOrdersController {
  constructor(
    @Inject(POS_ORDER_OPERATIONS)
    private readonly orders: PosOrderOperationsPort,
  ) {}

  @Get('recent')
  @UseGuards(PosDeviceGuard)
  recent(
    @Req() req: PosDeviceRequest,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PosOrderDto[]> {
    return this.orders.recent(this.requireStoreStableId(req), limit);
  }

  @Get('board')
  @UseGuards(PosDeviceGuard)
  board(
    @Req() req: PosDeviceRequest,
    @Query('status') statusRaw?: string,
    @Query('channel') channelRaw?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sinceMinutes', new DefaultValuePipe(1440), ParseIntPipe)
    sinceMinutes?: number,
  ): Promise<PosOrderDto[]> {
    const statusIn = statusRaw
      ? (statusRaw
          .split(',')
          .map((status) => status.trim())
          .filter(Boolean) as OrderStatus[])
      : undefined;
    const channelIn = channelRaw
      ? (channelRaw
          .split(',')
          .map((channel) => channel.trim())
          .filter(Boolean) as Array<'web' | 'in_store' | 'ubereats'>)
      : undefined;

    return this.orders.board(this.requireStoreStableId(req), {
      statusIn,
      channelIn,
      limit,
      sinceMinutes,
    });
  }

  @Patch(':orderStableId/status')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  updateStatus(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: LegacyUpdateStatusDto,
  ): Promise<PosOrderDto> {
    return this.orders.updateStatusForStore(
      orderStableId,
      this.requireStoreStableId(req),
      body.status,
    );
  }

  @Post(':orderStableId/amendments')
  @HttpCode(201)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async createAmendment(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: LegacyCreateOrderAmendmentDto,
  ): Promise<PosOrderDto> {
    await this.orders.getByStableIdForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
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

  @Post(':orderStableId/advance')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  advance(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderDto> {
    return this.orders.advanceForStore(
      orderStableId,
      this.requireStoreStableId(req),
    );
  }

  @Get('scheduled')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async listScheduledOrders(@Req() req: PosDeviceRequest) {
    return {
      orders: await this.orders.listUpcomingScheduledForStore(
        this.requireStoreStableId(req),
      ),
    };
  }

  @Get(':orderStableId/fulfillment-timing')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  getFulfillmentTiming(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    return this.requireTiming(this.requireStoreStableId(req), orderStableId);
  }

  @Post(':orderStableId/preparation/start')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  async startPreparationEarly(
    @Req() req: PosDeviceRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    const storeStableId = this.requireStoreStableId(req);
    const current = await this.requireTiming(storeStableId, orderStableId);
    if (current.fulfillmentTiming !== 'SCHEDULED') {
      throw new BadRequestException('order is not scheduled');
    }
    await this.orders.activateScheduledPreparation(orderStableId, storeStableId);
    return this.requireTiming(storeStableId, orderStableId);
  }

  private async requireTiming(
    storeStableId: string,
    orderStableId: string,
  ): Promise<PosOrderFulfillmentTimingDto> {
    const timing = await this.orders.getFulfillmentTimingForStore(
      orderStableId,
      storeStableId,
    );
    if (!timing) throw new NotFoundException('order not found');
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
