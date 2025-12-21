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
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
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
} from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './order-status';
import { OrderSummaryDto } from './dto/order-summary.dto';

class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
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

    // 一般不允许“同时退 + 同时补收”（你现在的语义是单向差额）
    if (refund > 0 && charge > 0) return false;

    switch (type) {
      case OrderAmendmentType.RETENDER: {
        // ✅ 收紧：RETENDER 必须不带 items
        if (items.length > 0) return false;
        // 至少一边金额 > 0
        if (refund <= 0 && charge <= 0) return false;
        return true;
      }

      case OrderAmendmentType.VOID_ITEM: {
        // 必须有 items，且只能 VOID
        if (items.length === 0) return false;
        if (!hasVoid || hasAdd) return false;
        // VOID 通常应当有退款金额（否则积分/返现调整也不会发生）
        if (refund <= 0) return false;
        // VOID 不应该补收
        if (charge > 0) return false;
        return true;
      }

      case OrderAmendmentType.SWAP_ITEM: {
        // 必须同时有 VOID + ADD
        if (items.length === 0) return false;
        if (!(hasVoid && hasAdd)) return false;
        // swap 允许差额为 0（等价交换）
        return true;
      }

      case OrderAmendmentType.ADDITIONAL_CHARGE: {
        // 不允许 VOID
        if (hasVoid) return false;
        // 允许 items 为空，但必须有补收金额
        if (charge <= 0) return false;
        // 补收不应该带 refundGross（否则语义冲突）
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

  // 本次“应退总额”（用于后端拆分：现金退 vs 积分返还）
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refundGrossCents?: number;

  // 本次“补收总额”
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  additionalChargeCents?: number;

  // RETENDER 必须空；VOID/SWAP 通常会有 items（由一致性校验器约束）
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
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  /**
   * 最近订单（仅 limit，绝不读取/校验 id）
   * GET /api/v1/orders/recent?limit=10
   */
  @Get('recent')
  recent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.recent(limit);
  }

  /**
   * 门店订单看板：
   * GET /api/v1/orders/board
   *
   * 查询参数：
   * - status: 逗号分隔的状态列表，例如：pending,paid,making,ready
   * - channel: 逗号分隔的渠道列表，例如：web,in_store
   * - limit: 最大返回数量（默认 50）
   * - sinceMinutes: 只看最近 N 分钟内的订单（默认 24*60）
   */
  @Get('board')
  board(
    @Query('status') statusRaw?: string,
    @Query('channel') channelRaw?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('sinceMinutes', new DefaultValuePipe(1440), ParseIntPipe)
    sinceMinutes?: number,
  ) {
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
   * 按 ID 获取订单（仅接受 UUID v4）
   * GET /api/v1/orders/:id
   */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ordersService.getById(id);
  }

  @Post('loyalty-only')
  async createLoyaltyOnlyOrder(@Body() payload: any) {
    // 这里先做一个最基本的校验，防止被乱调用
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload');
    }

    return this.ordersService.createLoyaltyOnlyOrder(payload);
  }

  /**
   * 更新订单状态（仅接受 UUID）
   * PATCH /api/v1/orders/:id/status
   */
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }

  /**
   * 创建订单修订（方案 B）
   * POST /api/v1/orders/:id/amendments
   */
  @Post(':id/amendments')
  @HttpCode(201)
  createAmendment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: CreateOrderAmendmentDto,
  ) {
    return this.ordersService.createAmendment({
      orderId: id,
      type: body.type,
      reason: body.reason,
      paymentMethod: body.paymentMethod ?? null,
      refundGrossCents: body.refundGrossCents ?? 0,
      additionalChargeCents: body.additionalChargeCents ?? 0,
      items: body.items ?? [],
    });
  }

  /**
   * 推进订单状态（前端“推进状态”按钮：paid→making→ready→completed）
   * POST /api/v1/orders/:id/advance
   * 返回推进后的订单（仅接受 UUID）
   */
  @Post(':id/advance')
  @HttpCode(200)
  advance(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ordersService.advance(id);
  }

  /**
   * GET /orders/:order/summary
   * 给前端 thank-you 页面的小结组件用
   */
  @Get(':order/summary')
  getPublicSummary(@Param('order') order: string): Promise<OrderSummaryDto> {
    return this.ordersService.getPublicOrderSummary(order);
  }
}
