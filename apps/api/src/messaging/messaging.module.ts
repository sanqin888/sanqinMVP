import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrandStoreConfigModule } from '../store/public-api';
import { BusinessConfigService } from './business-config.service';
import { TemplateRenderer } from './template-renderer';
import { AwsSnsWebhookController } from './webhooks/aws-sns.webhook.controller';
import { AwsSnsWebhookService } from './webhooks/aws-sns.webhook.service';
import { OrderEventsBus } from './order-events.bus';

@Module({
  imports: [PrismaModule, BrandStoreConfigModule],
  controllers: [AwsSnsWebhookController],
  providers: [
    TemplateRenderer,
    BusinessConfigService,
    AwsSnsWebhookService,
    OrderEventsBus,
  ],
  exports: [TemplateRenderer, BusinessConfigService, OrderEventsBus],
})
export class MessagingModule {}
