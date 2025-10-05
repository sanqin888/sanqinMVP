import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Controller('api')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('orders')
  create(@Body() dto: CreateOrderDto): Promise<OrderWithItems> {
    return this.ordersService.create(dto);
  }

  @Get('orders/recent')
  recent(): Promise<OrderWithItems[]> {
    return this.ordersService.recent(10);
  }

  @Patch('orders/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderWithItems> {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Post('orders/:id/advance')
  advance(@Param('id') id: string): Promise<OrderWithItems> {
    return this.ordersService.advance(id);
  }
}
