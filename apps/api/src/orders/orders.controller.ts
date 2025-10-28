import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { IsEnum } from 'class-validator';

// 与前端按钮一致的状态集合（保持小写）
// 如你的项目里已有 OrderStatus 枚举，也可以把这里换成 import
export enum OrderStatus {
  pending = 'pending',
  paid = 'paid',
  making = 'making',
  ready = 'ready',
  completed = 'completed',
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * 创建一单（前端“创建一单”按钮）
   * POST /api/orders
   * 返回 201 + JSON
   */
  @Post()
  async create(@Body() dto: CreateOrderDto) {
    // 如果你的 Service 里做了“元→分”的单位转换，这里直接透传即可；
    // 如需在控制器转换，可在此 Math.round(dto.total * 100) 后再传入。
    const order = await this.ordersService.create(dto);
    return order;
  }

  /**
   * 最近十单（前端“刷新”按钮）
   * GET /api/orders/recent?limit=10
   * 默认 10
   */
  @Get('recent')
  async recent(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.recent(Number.isFinite(n) ? n : 10);
  }

  /**
   * 设置订单状态（前端“标记为已支付”等）
   * PATCH /api/orders/:id/status
   * Body: { status: 'paid' | 'making' | ... }
   */
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, body.status);
  }

  /**
   * 推进订单状态（前端“推进状态”按钮：paid→making→ready→completed）
   * POST /api/orders/:id/advance
   * 返回推进后的订单
   */
  @Post(':id/advance')
  @HttpCode(200)
  async advance(@Param('id') id: string) {
    return this.ordersService.advance(id);
  }
}
