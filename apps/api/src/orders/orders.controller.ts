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
import { IsEnum } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './order-status';
import { OrderSummaryDto } from './dto/order-summary.dto';

class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
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
