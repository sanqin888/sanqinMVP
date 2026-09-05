import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from '../store/public-api';
import { BusinessConfigService } from './business-config.service';
import { TemplateRenderer } from './template-renderer';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [TemplateRenderer, BusinessConfigService],
  exports: [TemplateRenderer, BusinessConfigService],
})
export class MessagingModule {}
