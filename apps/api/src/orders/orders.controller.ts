import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

// 带 items 的返回类型
type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Controller('api')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('orders')
  create(@Body() dto: CreateOrderDto): Promise<OrderWithItems> {
    return this.ordersService.create(dto);
  }

  // 最近 N 单（默认 10，?limit=5 可调整，最大 100 在 service 内限制）
  @Get('orders/recent')
  recent(@Query('limit') limit?: string): Promise<OrderWithItems[]> {
    const n = Number(limit);
    return this.ordersService.recent(Number.isFinite(n) ? n : 10);
  }
}
