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
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './order-status';

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
  async create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  /**
   * 最近订单（仅 limit，绝不读取/校验 id）
   * GET /api/v1/orders/recent?limit=10
   */
  @Get('recent')
  async recent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.recent(limit); // 对齐 Service 方法名
  }

  /**
   * 按 ID 获取订单（仅接受 UUID v4）
   * GET /api/v1/orders/:id
   */
  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ordersService.getById(id); // 对齐 Service 方法名
  }

  /**
   * 更新订单状态（仅接受 UUID）
   * PATCH /api/v1/orders/:id/status
   */
  @Patch(':id/status')
  async updateStatus(
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
  async advance(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.ordersService.advance(id);
  }
}
