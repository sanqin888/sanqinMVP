import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessConfigService } from './business-config.service';
import { TemplateRenderer } from './template-renderer';

@Module({
  imports: [PrismaModule],
  providers: [TemplateRenderer, BusinessConfigService],
  exports: [TemplateRenderer, BusinessConfigService],
})
export class MessagingModule {}
