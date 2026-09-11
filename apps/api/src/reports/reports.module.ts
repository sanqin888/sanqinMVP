import { Module } from '@nestjs/common';

import {
  ORDER_REPORTING_FACTS_READER,
  OrderReportingFactsModule,
  type OrderReportingFactsReaderPort,
} from '../orders/public-api';
import {
  REPORTING_ORDER_FACTS_QUERY,
  type ReportingOrderFactsQueryPort,
} from './reporting-order-facts-query.contract';
import { REPORTING_TOP_ITEMS_QUERY } from './reporting-top-items-query.contract';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [OrderReportingFactsModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORTING_ORDER_FACTS_QUERY,
      inject: [ORDER_REPORTING_FACTS_READER],
      useFactory: (
        orders: OrderReportingFactsReaderPort,
      ): ReportingOrderFactsQueryPort => ({
        readMetricsForRange: (startDate, endDate) =>
          orders.readMetricsForRange(startDate, endDate),
        readItemsForRange: (startDate, endDate) =>
          orders.readItemsForRange(startDate, endDate),
      }),
    },
    ReportsService,
    {
      provide: REPORTING_TOP_ITEMS_QUERY,
      useExisting: ReportsService,
    },
  ],
  exports: [REPORTING_TOP_ITEMS_QUERY],
})
export class ReportsModule {}
