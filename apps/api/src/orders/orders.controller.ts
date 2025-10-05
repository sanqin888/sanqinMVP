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

  // 设置为指定状态（pending→paid→making→ready→completed）
  @Patch('orders/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderWithItems> {
    return this.ordersService.updateStatus(id, dto.status);
  }

  // 前进一步（例如 paid→making）
  @Post('orders/:id/advance')
  advance(@Param('id') id: string): Promise<OrderWithItems> {
    return this.ordersService.advanceStatus(id);
  }
}
