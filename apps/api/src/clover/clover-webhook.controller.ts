import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { CloverWebhookService } from './clover-webhook.service';

@Controller('clover/webhook')
export class CloverWebhookController {
  private readonly logger = new AppLogger(CloverWebhookController.name);

  constructor(private readonly webhookService: CloverWebhookService) {}

  @Post()
  @HttpCode(200)
  handleWebhook(
    @Headers('clover-signature') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    if (!payload) {
      this.logger.warn('Missing webhook payload');
      throw new BadRequestException('Missing payload');
    }

    if (!signature) {
      this.logger.warn('Missing Clover-Signature header');
      throw new UnauthorizedException('Missing signature');
    }

    const isValid = this.webhookService.verifySignature(payload, signature);
    if (!isValid) {
      this.logger.error('Invalid Clover webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    void this.webhookService.processPayload(payload).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Failed to process webhook: ${message}`, stack);
    });

    return { received: true };
  }
}
