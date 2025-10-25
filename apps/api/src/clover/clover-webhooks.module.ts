import { Module } from '@nestjs/common';
import { CloverHcoWebhookController } from './clover-webhooks.controller';

@Module({
  controllers: [CloverHcoWebhookController],
})
export class CloverWebhooksModule {}
