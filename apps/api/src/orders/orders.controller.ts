// apps/api/src/orders/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  ForbiddenException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  OrderAmendmentType,
  OrderAmendmentItemAction,
  PaymentMethod,
  Prisma,
  OrderStatus as PrismaOrderStatus,
  FulfillmentType,
  DeliveryType,
} from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderSchema } from '@shared/order';
import type { CreateOrderInput } from '@shared/order';
import type { OrderStatus } from './order-status';
import type { OrderSummaryDto } from './dto/order-summary.dto';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { OrderDto } from './dto/order.dto';

type AuthedRequest = Request & {
  user?: { id?: string; userStableId?: string };
};

class UpdateStatusDto {
  @IsEnum(PrismaOrderStatus)
  status!: OrderStatus;
}

class LoyaltyOrderItemDto {
  @IsString()
  productStableId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

class CreateLoyaltyOnlyOrderDto {
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  deliveryDestination?: DeliveryDestinationDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LoyaltyOrderItemDto)
  items!: LoyaltyOrderItemDto[];
}

class DeliveryDestinationDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  city!: string;

  @IsString()
  province!: string;

  @IsString()
  postalCode!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
}

class CreateOrderAmendmentItemDto {
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

  // optionsJson 允许任意 JSON（dev 环境不做深校验）
  @IsOptional()
  optionsJson?: Prisma.InputJsonValue;
}

@ValidatorConstraint({ name: 'AmendmentRequestConsistency', async: false })
class AmendmentRequestConsistency implements ValidatorConstraintInterface {
  validate(type: OrderAmendmentType, args: ValidationArguments): boolean {
    const dto = args.object as CreateOrderAmendmentDto;

    const items = Array.isArray(dto.items) ? dto.items : [];
    const refund = Number.isFinite(dto.refundGrossCents)
      ? Math.max(0, Math.round(dto.refundGrossCents as number))
      : 0;
    const charge = Number.isFinite(dto.additionalChargeCents)
      ? Math.max(0, Math.round(dto.additionalChargeCents as number))
      : 0;

    const hasVoid = items.some(
      (i) => i.action === OrderAmendmentItemAction.VOID,
    );
    const hasAdd = items.some((i) => i.action === OrderAmendmentItemAction.ADD);

    if (refund > 0 && charge > 0) return false;

    switch (type) {
      case OrderAmendmentType.RETENDER: {
        if (items.length > 0) return false;
        if (refund <= 0 && charge <= 0) return false;
        return true;
      }

      case OrderAmendmentType.VOID_ITEM: {
        if (items.length === 0) return false;
        if (!hasVoid || hasAdd) return false;
        if (refund <= 0) return false;
        if (charge > 0) return false;
        return true;
      }

      case OrderAmendmentType.SWAP_ITEM: {
        if (items.length === 0) return false;
        if (!(hasVoid && hasAdd)) return false;
        return true;
      }

      case OrderAmendmentType.ADDITIONAL_CHARGE: {
        if (hasVoid) return false;
        if (charge <= 0) return false;
        if (refund > 0) return false;
        return true;
      }

      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateOrderAmendmentDto;
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

class CreateOrderAmendmentDto {
  @IsEnum(OrderAmendmentType)
  @Validate(AmendmentRequestConsistency)
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
  @Type(() => CreateOrderAmendmentItemDto)
  items?: CreateOrderAmendmentItemDto[];
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 创建订单
   * POST /api/v1/orders
   */
  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateOrderSchema))
  create(@Body() dto: CreateOrderInput): Promise<OrderDto> {
    if (dto.channel !== 'web') {
      throw new BadRequestException('Public create only allows channel=web');
    }
    return this.ordersService.create(dto);
  }

  /**
   * 最近订单
   * GET /api/v1/orders/recent?limit=10
   */
  @Get('recent')
  @UseGuards(PosDeviceGuard)
  recent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<OrderDto[]> {
    return this.ordersService.recent(limit);
  }

  /**
   * 门店订单看板：
   * GET /api/v1/orders/board
   */
  @Get('board')
  @UseGuards(PosDeviceGuard)
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

    return this.ordersService.board({
      statusIn,
      channelIn,
      limit,
      sinceMinutes,
    });
  }

  /**
   * 按 stableId 获取订单
   * GET /api/v1/orders/:orderStableId
   */
  @Get(':orderStableId')
  @UseGuards(SessionAuthGuard)
  async findOne(
    @Req() req: AuthedRequest,
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderDto> {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

    const { order, ownerUserStableId } =
      await this.ordersService.getByStableIdWithOwner(orderStableId);

    if (!ownerUserStableId || ownerUserStableId !== userStableId) {
      throw new ForbiddenException('order access forbidden');
    }

    return order;
  }

  @Post('loyalty-only')
  @UseGuards(SessionAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async createLoyaltyOnlyOrder(
    @Req() req: AuthedRequest,
    @Body() payload: CreateLoyaltyOnlyOrderDto,
  ): Promise<OrderDto> {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

    const fulfillmentType = payload.fulfillmentType ?? FulfillmentType.pickup;
    if (
      fulfillmentType !== FulfillmentType.pickup &&
      fulfillmentType !== FulfillmentType.delivery
    ) {
      throw new BadRequestException('fulfillmentType must be pickup or delivery');
    }

    if (fulfillmentType === FulfillmentType.delivery) {
      if (!payload.deliveryDestination) {
        throw new BadRequestException('deliveryDestination is required');
      }
    }

    return this.ordersService.createLoyaltyOnlyOrder({
      userStableId,
      fulfillmentType,
      deliveryType: payload.deliveryType,
      deliveryDestination: payload.deliveryDestination,
      items: payload.items,
    });
  }

  /**
   * 更新订单状态
   * PATCH /api/v1/orders/:orderStableId/status
   */
  @Patch(':orderStableId/status')
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  updateStatus(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<OrderDto> {
    return this.ordersService.updateStatus(orderStableId, body.status);
  }

  /**
   * 创建订单修订（方案 B）
   * POST /api/v1/orders/:orderStableId/amendments
   */
  @Post(':orderStableId/amendments')
  @HttpCode(201)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  createAmendment(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: CreateOrderAmendmentDto,
  ): Promise<OrderDto> {
    return this.ordersService.createAmendment({
      orderStableId,
      type: body.type,
      reason: body.reason,
      paymentMethod: body.paymentMethod ?? null,
      refundGrossCents: body.refundGrossCents ?? 0,
      additionalChargeCents: body.additionalChargeCents ?? 0,
      items: body.items ?? [],
    });
  }

  /**
   * 推进订单状态
   * POST /api/v1/orders/:orderStableId/advance
   */
  @Post(':orderStableId/advance')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
  @Roles('ADMIN', 'STAFF')
  advance(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderDto> {
    return this.ordersService.advance(orderStableId);
  }

  /**
   * GET /orders/:orderStableId/summary
   * thank-you 页面小结组件
   */
  @Get(':orderStableId/summary')
  getPublicSummary(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderSummaryDto> {
    return this.ordersService.getPublicOrderSummary(orderStableId);
  }
}
