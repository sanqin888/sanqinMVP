import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from './brand-store-config.module';
import { PublicWebConfigController } from './public-web-config.controller';
import { PublicWebConfigService } from './public-web-config.service';

@Module({
  imports: [BrandStoreConfigModule],
  controllers: [PublicWebConfigController],
  providers: [PublicWebConfigService],
})
export class PublicWebConfigModule {}
