import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CloverService } from './clover.service';
import { SimulateOnlinePaymentDto } from './dto/simulate-online-payment.dto';

@Controller('clover')
export class CloverPayController {
  constructor(private readonly clover: CloverService) {}

  // 有全局前缀后的最终路由：/api/v1/clover/pay/online/simulate
  @Post('pay/online/simulate')
  @HttpCode(200)
  async simulate(@Body() payload: SimulateOnlinePaymentDto) {
    await this.clover.simulateOnlinePayment({
      orderId: payload.orderId,
      result: payload.result ?? 'SUCCESS',
    });
    return { ok: true };
  }
}
