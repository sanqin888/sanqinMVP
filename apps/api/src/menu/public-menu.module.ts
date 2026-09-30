// apps/api/src/menu/public-menu.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';
import { DailySpecialOffersModule } from '../promotions/public-api';
import { BrandStoreConfigModule } from '../store/public-api';

@Module({
  imports: [PrismaModule, DailySpecialOffersModule, BrandStoreConfigModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
  exports: [PublicMenuService],
})
export class PublicMenuModule {}
