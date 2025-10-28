import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './order-status';
import { CuidOrUuidPipe } from '../common/pipes/cuid-or-uuid.pipe';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 创建一单（前端“创建一单”按钮）
   * POST /api/v1/orders
   * 返回 201 + JSON
   */
  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const order = await this.ordersService.create(dto, idempotencyKey);
    return order;
  }

  /**
   * 订单详情
   * GET /api/v1/orders/:id
   */
  @Get(':id')
  async getOne(@Param('id', CuidOrUuidPipe) id: string) {
    return this.ordersService.getById(id);
  }

  /**
   * 最近十单（前端“刷新”按钮）
   * GET /api/v1/orders/recent?limit=10
   * 默认 10
   */
  @Get('recent')
  async recent(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.recent(Number.isFinite(n) ? n : 10);
  }

  /**
   * 设置订单状态（前端“标记为已支付”等）
   * PATCH /api/v1/orders/:id/status
   * Body: { status: 'paid' | 'making' | ... }
   */
  @Patch(':id/status')
  async setStatus(
    @Param('id', CuidOrUuidPipe) id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }

  /**
   * 推进订单状态（前端“推进状态”按钮：paid→making→ready→completed）
   * POST /api/v1/orders/:id/advance
   * 返回推进后的订单
   */
  @Post(':id/advance')
  @HttpCode(200)
  async advance(@Param('id', CuidOrUuidPipe) id: string) {
    return this.ordersService.advance(id);
  }
}
