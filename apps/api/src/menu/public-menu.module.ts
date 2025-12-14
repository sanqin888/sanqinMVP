// apps/api/src/menu/public-menu.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
  exports: [PublicMenuService],
})
export class PublicMenuModule {}
