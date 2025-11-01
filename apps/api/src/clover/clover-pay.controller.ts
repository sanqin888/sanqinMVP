import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CloverService } from "./clover.service";

@Controller("clover")
export class CloverPayController {
  constructor(private readonly clover: CloverService) {}

  /**
   * 前端调用：POST /clover/pay/online/hosted-checkout
   * 作用：创建 Clover Hosted Checkout 会话并返回跳转链接
   */
  @Post("pay/online/hosted-checkout")
  @HttpCode(200)
  async createHostedCheckout(
    // 用 any 接 DTO，避免和 Service 入参的货币联合类型冲突
    @Body() body: any,
  ) {
    // 把前端传来的 currency 规范化为 Clover 可接受的联合类型
    const currency: "CAD" | "USD" = body?.currency === "USD" ? "USD" : "CAD";

    return this.clover.createHostedCheckout({
      amountCents: body?.amountCents,
      currency,
      referenceId: body?.referenceId,
      description: body?.description,
      returnUrl: body?.returnUrl,
      metadata: body?.metadata,
    });
  }
}
