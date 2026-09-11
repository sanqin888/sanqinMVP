import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  REPORTING_TOP_ITEMS_QUERY,
  ReportsModule,
  type ReportingTopItemsQueryPort,
} from '../reports/public-api';
import { HomepageContentController } from './homepage-content.controller';
import { HomepageContentService } from './homepage-content.service';
import { HomepageFeaturedService } from './homepage-featured.service';
import {
  HOMEPAGE_SALES_RANKING_QUERY,
  type HomepageSalesRankingQueryPort,
} from './homepage-sales-ranking-query.contract';

@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [HomepageContentController],
  providers: [
    {
      provide: HOMEPAGE_SALES_RANKING_QUERY,
      inject: [REPORTING_TOP_ITEMS_QUERY],
      useFactory: (
        reporting: ReportingTopItemsQueryPort,
      ): HomepageSalesRankingQueryPort => ({
        getTopItemsForRange: (startDate, endDate) =>
          reporting.getTopItemsForRange(startDate, endDate),
      }),
    },
    HomepageContentService,
    HomepageFeaturedService,
  ],
  exports: [HomepageContentService, HomepageFeaturedService],
})
export class HomepageContentModule {}
