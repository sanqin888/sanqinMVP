// apps/api/src/clover/clover-webhook.controller.ts
import {
  Controller,
  Post,
  Headers,
  Body,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { CloverWebhookService } from './clover-webhook.service';

@Controller('clover/webhook')
export class CloverWebhookController {
  private readonly logger = new AppLogger(CloverWebhookController.name);

  constructor(private readonly webhookService: CloverWebhookService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('clover-signature') signature: string | undefined,
    @Body() payload: any,
  ) {
    // 1. 预处理：确保我们能拿到 JSON 对象 (哪怕 payload 是 Buffer)
    let bodyJson: any = payload;
    if (Buffer.isBuffer(payload)) {
      try {
        bodyJson = JSON.parse(payload.toString('utf-8'));
      } catch (e) {
        this.logger.error('Failed to parse webhook body');
      }
    }

    // 2. 兼容性处理：如果 Clover 再次发送验证码 (虽然已验证，但保留此逻辑防报错)
    if (bodyJson && bodyJson.verificationCode) {
      this.logger.log('Received Clover Verification Heartbeat - OK');
      return { received: true };
    }

    // 3. 安全检查：正式通知必须带签名
    if (!signature) {
      this.logger.warn('Blocked unsigned webhook request');
      throw new UnauthorizedException('Missing Clover-Signature');
    }

    // 4. 核心验证：比对签名 (使用你刚配置的 CLOVER_WEBHOOK_KEY)
    // 注意：这里必须传入原始 payload (Buffer)，否则计算出的 Hash 会不一致
    const isValid = this.webhookService.verifySignature(payload, signature);

    if (!isValid) {
      this.logger.error(
        '❌ Invalid Clover webhook signature - Potential Attack',
      );
      throw new UnauthorizedException('Invalid signature');
    }

    // 5. 验证通过：异步处理业务逻辑 (更新订单等)
    this.logger.log('✅ Webhook Signature Verified. Processing event...');
    void this.webhookService.processPayload(bodyJson).catch((err) => {
      this.logger.error(`Failed to process webhook: ${err.message}`, err.stack);
    });

    return { received: true };
  }
}
