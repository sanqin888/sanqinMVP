// apps/api/src/clover/clover.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CloverService } from './clover.service';

type SimulateOnlinePaymentPayload = {
  orderId: string;
  result?: 'SUCCESS' | 'FAILURE';
};

@Controller('clover')
export class CloverController {
  constructor(private readonly clover: CloverService) {}

  // 最终路径（有全局前缀时）: /api/clover/pay/online/simulate
  @Post('pay/online/simulate')
  @HttpCode(200)
  async simulateOnlinePayment(@Body() body: SimulateOnlinePaymentPayload) {
    const { orderId, result = 'SUCCESS' } = body ?? {};
    // 保持向后兼容：若你的旧控制器还调用 simulateOnlinePayment(payload)，Service 里已有兼容方法
    return this.clover.simulateByChargeAndMarkIfSuccess(orderId, result);
  }
}
