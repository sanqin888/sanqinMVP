import { Module } from '@nestjs/common';

import {
  ORDER_REPORTING_FACTS_READER,
  OrderReportingFactsModule,
  type OrderReportingFactsReaderPort,
} from '../orders/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  STORE_SCHEDULE_READER,
  STORE_STATUS_READER,
  BrandStoreConfigModule,
  StoreStatusModule,
  type BrandStoreConfigReaderPort,
  type StoreScheduleReaderPort,
  type StoreStatusReaderPort,
} from '../store/public-api';
import {
  REPORTING_BUSINESS_ORDER_FACTS_QUERY,
  type ReportingBusinessOrderFactsQueryPort,
} from './reporting-business-order-facts-query.contract';
import {
  REPORTING_ORDER_FACTS_QUERY,
  type ReportingOrderFactsQueryPort,
} from './reporting-order-facts-query.contract';
import {
  REPORTING_STORE_OPERATING_CONTEXT_QUERY,
  type ReportingStoreOperatingContextQueryPort,
} from './reporting-store-operating-context.contract';
import { REPORTING_TOP_ITEMS_QUERY } from './reporting-top-items-query.contract';
import { BusinessOperationsReportService } from './business-operations-report.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    OrderReportingFactsModule,
    BrandStoreConfigModule,
    StoreStatusModule,
  ],
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
    {
      provide: REPORTING_BUSINESS_ORDER_FACTS_QUERY,
      inject: [ORDER_REPORTING_FACTS_READER],
      useFactory: (
        orders: OrderReportingFactsReaderPort,
      ): ReportingBusinessOrderFactsQueryPort => ({
        readOperationalOrdersForRange: async (query) => {
          const rows = await orders.readOperationalOrdersForRange(query);
          return rows.map((row) => ({ ...row }));
        },
        readOperationalItemsForRange: async (query) => {
          const rows = await orders.readOperationalItemsForRange(query);
          return rows.map((row) => ({
            ...row,
            components: row.components.map((component) => ({
              ...component,
            })),
          }));
        },
      }),
    },
    {
      provide: REPORTING_STORE_OPERATING_CONTEXT_QUERY,
      inject: [
        BRAND_STORE_CONFIG_READER,
        STORE_SCHEDULE_READER,
        STORE_STATUS_READER,
      ],
      useFactory: (
        config: BrandStoreConfigReaderPort,
        schedule: StoreScheduleReaderPort,
        status: StoreStatusReaderPort,
      ): ReportingStoreOperatingContextQueryPort => ({
        getStoreOperatingContext: async (storeStableId) => {
          const [store, businessHours, holidays, currentStatus] =
            await Promise.all([
              config.getStoreSnapshot(storeStableId),
              schedule.listBusinessHours(storeStableId),
              schedule.listHolidays(storeStableId),
              status.getCurrentStatus(storeStableId),
            ]);

          return {
            storeStableId: store.storeStableId,
            timezone: store.timezone,
            isActive: store.isActive,
            historyCoverage: 'CURRENT_CONFIGURATION_ONLY',
            businessHours: businessHours.map((hour) => ({ ...hour })),
            holidays: holidays.map((holiday) => ({ ...holiday })),
            currentStatus: {
              isOpenBySchedule: currentStatus.isOpenBySchedule,
              isTemporarilyClosed: currentStatus.isTemporarilyClosed,
              today: {
                date: currentStatus.today.date,
                closeMinutes: currentStatus.today.closeMinutes,
              },
            },
          };
        },
      }),
    },
    ReportsService,
    BusinessOperationsReportService,
    {
      provide: REPORTING_TOP_ITEMS_QUERY,
      useExisting: ReportsService,
    },
  ],
  exports: [REPORTING_TOP_ITEMS_QUERY],
})
export class ReportsModule {}
