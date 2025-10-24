import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CloverService } from './clover.service';
import { ListOrdersQueryDto } from './dto/list-orders.dto';

@Controller('clover')
export class CloverController {
  constructor(private readonly clover: CloverService) {}

  @Get('merchant')
  getMerchant() {
    return this.clover.getMerchantProfile();
  }

  @Get('orders')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  listOrders(@Query() query: ListOrdersQueryDto) {
    return this.clover.listOrders(query.limit);
  }
}
