import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CloverService } from "./clover.service";

@Controller("clover")
export class CloverController {
  constructor(private readonly clover: CloverService) {}

  // 前端 POST /clover/pay/online/hosted-checkout
  @Post("pay/online/hosted-checkout")
  @HttpCode(200)
  async createHostedCheckout(@Body() body: any) {
    // 前端已传：amountCents/currency/referenceId/description/returnUrl/metadata(items...)
    const { amountCents, currency, referenceId, description, returnUrl, metadata } = body || {};
    const result = await this.clover.createHostedCheckout({
      amountCents,
      currency,
      referenceId,
      description,
      returnUrl,
      metadata,
    });
    return result; // { checkoutUrl, checkoutId }
  }
}
