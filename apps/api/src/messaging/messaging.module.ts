import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from '../store/public-api';
import { BusinessConfigService } from './business-config.service';
import { TemplateRenderer } from './template-renderer';
import { OrderEventsBus } from './order-events.bus';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [TemplateRenderer, BusinessConfigService, OrderEventsBus],
  exports: [TemplateRenderer, BusinessConfigService, OrderEventsBus],
})
export class MessagingModule {}
