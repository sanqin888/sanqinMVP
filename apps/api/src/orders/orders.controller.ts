import { Body, Controller, Get, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Controller('api')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('orders')
  async create(@Body() dto: CreateOrderDto): Promise<OrderWithItems> {
    // 不做 try/catch 返回错误对象，交给全局异常过滤器处理，避免 no-unsafe-return/call
    return this.ordersService.create(dto);
  }

  @Get('orders/recent')
  recent(): Promise<OrderWithItems[]> {
    return this.ordersService.recent(10);
  }
}
