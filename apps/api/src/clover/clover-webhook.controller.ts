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
    @Headers('clover-signature') signature: string | undefined, // 允许为空
    @Body() payload: any,
  ) {
    // 1. 特殊处理：Clover 的“验证请求” (没有签名，只有 verificationCode)
    // 注意：payload 可能是 Buffer (因为 main.ts 配置了 raw)，需要尝试解析
    let bodyJson: any = payload;

    // 如果是 Buffer，尝试转成 JSON 对象
    if (Buffer.isBuffer(payload)) {
      try {
        bodyJson = JSON.parse(payload.toString('utf-8'));
      } catch (e) {
        // 解析失败，保持原样，后面会报错
      }
    }

    if (bodyJson && bodyJson.verificationCode) {
      this.logger.log(`🌟 收到 Clover 验证代码: ${bodyJson.verificationCode}`);
      console.log(
        `\n>>> 请复制此代码到 Clover 后台: ${bodyJson.verificationCode} <<<\n`,
      );
      return { received: true }; // 直接返回 200，跳过签名验证
    }

    // 2. 正常处理：正式通知 (必须有签名)
    if (!signature) {
      this.logger.warn('Missing Clover-Signature header on payment event');
      throw new UnauthorizedException('Missing signature');
    }

    // 3. 验证签名
    const isValid = this.webhookService.verifySignature(payload, signature);
    if (!isValid) {
      this.logger.error('Invalid Clover webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    // 4. 处理业务逻辑
    void this.webhookService.processPayload(bodyJson).catch((err) => {
      this.logger.error(`Failed to process webhook: ${err.message}`, err.stack);
    });

    return { received: true };
  }
}
