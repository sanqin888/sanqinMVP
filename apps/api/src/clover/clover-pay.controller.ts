import { BadGatewayException, Body, Controller, Post } from '@nestjs/common';
import { CloverService } from './clover.service';
import { CreateHostedCheckoutDto } from './dto/create-hosted-checkout.dto'; // ✅ 用你已有的 DTO

@Controller('clover')
export class CloverPayController {
  constructor(private readonly clover: CloverService) {}

  @Post('pay/online/hosted-checkout')
  async createCheckout(@Body() dto: CreateHostedCheckoutDto) {
    const result = await this.clover.createHostedCheckout(dto);

    if (!result.ok) {
      throw new BadGatewayException({
        message: `Failed to create Clover hosted checkout: ${result.reason}`,
        reason: result.reason,
      });
    }

    return {
      checkoutUrl: result.href,
      checkoutId: result.checkoutSessionId,
    };
  }
}
