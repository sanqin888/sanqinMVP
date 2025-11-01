import { Body, Controller, Post } from '@nestjs/common';
import { CloverService } from './clover.service';
import { CreateHostedCheckoutDto } from './dto/create-hosted-checkout.dto'; // ✅ 用你已有的 DTO

@Controller('clover')
export class CloverPayController {
  constructor(private readonly clover: CloverService) {}

  @Post('pay/checkout')
  async createCheckout(@Body() dto: CreateHostedCheckoutDto) { // ✅ DTO 进来就有静态类型
    return this.clover.createHostedCheckout(dto);
  }
}
