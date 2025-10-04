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
    // 不做 try/catch，交给 Nest 统一异常处理，避免直接返回/调用 unknown
    return this.ordersService.create(dto);
  }

  @Get('orders/recent')
  listRecent(): Promise<OrderWithItems[]> {
    return this.ordersService.listRecent(10);
  }
}
