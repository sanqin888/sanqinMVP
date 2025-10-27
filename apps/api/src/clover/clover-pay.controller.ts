import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CloverService } from './clover.service';

type SimulateOnlinePaymentPayload = {
  orderId: string;
  result?: 'SUCCESS' | 'FAILURE';
};

@Controller('clover')
export class CloverPayController {
  constructor(private readonly clover: CloverService) {}

  // 因为没有全局前缀，最终路由就是：/clover/pay/online/simulate
  @Post('pay/online/simulate')
  @HttpCode(200)
  async simulate(@Body() payload: SimulateOnlinePaymentPayload) {
    await this.clover.simulateOnlinePayment({
      orderId: payload.orderId,
      result: payload.result ?? 'SUCCESS',
    });
    return { ok: true };
  }
}
