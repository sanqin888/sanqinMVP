// apps/api/src/orders/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
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
} from 'class-validator';
import { FulfillmentType, DeliveryType } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderSchema } from '@shared/order';
import type { CreateOrderInput } from '@shared/order';
import type { OrderSummaryDto } from './dto/order-summary.dto';
import { StableIdPipe } from '../common/pipes/stable-id.pipe';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { OptionalSessionAuthGuard } from '../auth/optional-session-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { OrderDto } from './dto/order.dto';

type AuthedRequest = Request & {
  user?: { id?: string; userStableId?: string; email?: string | null };
};

class LoyaltyOrderItemDto {
  @IsString()
  productStableId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

class DeliveryDestinationDto {
  @IsOptional()
  @IsString()
  addressStableId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsString()
  addressLine1!: string;

  @IsOptional()
  @IsString()
  placeId?: string;

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

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 创建订单
   * POST /api/v1/orders
   */
  @Post()
  @HttpCode(201)
  @UseGuards(OptionalSessionAuthGuard)
  @UsePipes(new ZodValidationPipe(CreateOrderSchema))
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateOrderInput,
  ): Promise<OrderDto> {
    if (dto.channel !== 'web') {
      throw new BadRequestException('Public create only allows channel=web');
    }
    return this.ordersService.create({
      ...dto,
      userStableId: req.user?.userStableId?.trim() || undefined,
    });
  }

  /**
   * Web checkout pricing preview. Read-only and server-authoritative.
   * POST /api/v1/orders/pricing/quote
   */
  @Post('pricing/quote')
  @HttpCode(200)
  @UseGuards(OptionalSessionAuthGuard)
  @UsePipes(new ZodValidationPipe(CreateOrderSchema))
  quotePricing(@Req() req: AuthedRequest, @Body() dto: CreateOrderInput) {
    if (dto.channel !== 'web') {
      throw new BadRequestException(
        'Public pricing quote only allows channel=web',
      );
    }
    return this.ordersService.quoteOrderPricing({
      ...dto,
      userStableId: req.user?.userStableId?.trim() || undefined,
      discountCents: undefined,
    });
  }

  /**
   * 近一小时平均制作时间
   * GET /api/v1/orders/prep-time
   */
  @Get('prep-time')
  async getAveragePrepTime(): Promise<{ minutes: number }> {
    const minutes = await this.ordersService.getAveragePrepTimeMinutes();
    return { minutes };
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
      throw new BadRequestException(
        'fulfillmentType must be pickup or delivery',
      );
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
   * GET /orders/:orderStableId/summary
   * thank-you 页面小结组件
   */
  @Get(':orderStableId/summary')
  getPublicSummary(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
  ): Promise<OrderSummaryDto> {
    return this.ordersService.getPublicOrderSummary(orderStableId);
  }

  /**
   * POST /orders/:orderStableId/invoice/email
   * guest invoice email
   */
  @Post(':orderStableId/invoice/email')
  @HttpCode(200)
  sendInvoiceEmail(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Body() body: { email?: string; locale?: string },
  ): Promise<{ ok: boolean }> {
    return this.ordersService.sendInvoiceEmail({
      orderStableId,
      email: body?.email,
      locale: body?.locale,
    });
  }

  /**
   * POST /orders/:orderStableId/invoice/email/member
   * member invoice email
   */
  @Post(':orderStableId/invoice/email/member')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  sendInvoiceEmailForMember(
    @Param('orderStableId', StableIdPipe) orderStableId: string,
    @Req() req: AuthedRequest,
    @Body() body: { locale?: string },
  ): Promise<{ ok: boolean }> {
    return this.ordersService.sendInvoiceEmail({
      orderStableId,
      email: req.user?.email ?? null,
      locale: body?.locale,
    });
  }

}
