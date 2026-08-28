import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { HomepageContentController } from './homepage-content.controller';
import { HomepageContentService } from './homepage-content.service';
import { HomepageFeaturedService } from './homepage-featured.service';

@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [HomepageContentController],
  providers: [HomepageContentService, HomepageFeaturedService],
  exports: [HomepageContentService, HomepageFeaturedService],
})
export class HomepageContentModule {}
