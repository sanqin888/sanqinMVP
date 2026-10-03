import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  ORDER_MARKETING_USAGE_FACTS_READER,
  ORDER_REPORTING_FACTS_READER,
  OrderMarketingUsageFactsModule,
  OrderReportingFactsModule,
  type OrderMarketingUsageFactsReaderPort,
  type OrderReportingFactsReaderPort,
} from '../orders/public-api';
import {
  MARKETING_CAMPAIGN_FACTS_READER,
  MarketingCampaignFactsModule,
  type MarketingCampaignFactsReaderPort,
} from '../promotions/public-api';
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
  REPORTING_MARKETING_CAMPAIGNS_QUERY,
  type ReportingMarketingCampaignsQueryPort,
} from './reporting-marketing-campaigns-query.contract';
import {
  REPORTING_MARKETING_USAGE_QUERY,
  type ReportingMarketingUsageQueryPort,
} from './reporting-marketing-usage-query.contract';
import {
  REPORTING_ORDER_FACTS_QUERY,
  type ReportingOrderFactsQueryPort,
} from './reporting-order-facts-query.contract';
import {
  REPORTING_STORE_LOCATION_QUERY,
  type ReportingStoreLocationQueryPort,
} from './reporting-store-location-query.contract';
import {
  REPORTING_STORE_OPERATING_CONTEXT_QUERY,
  type ReportingStoreOperatingContextQueryPort,
} from './reporting-store-operating-context.contract';
import { REPORTING_TOP_ITEMS_QUERY } from './reporting-top-items-query.contract';
import {
  REPORTING_WEATHER_DB,
  type ReportingWeatherDbPort,
} from './reporting-weather-db.contract';
import {
  REPORTING_WEATHER_HISTORY_STORE,
} from './reporting-weather-history-store.contract';
import {
  REPORTING_WEATHER_PROVIDER,
} from './reporting-weather-provider.contract';
import { BusinessOperationsReportService } from './business-operations-report.service';
import { MarketingOverviewReportService } from './marketing-overview-report.service';
import { MeteostatWeatherProvider } from './meteostat-weather.provider';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { WeatherHistoryService } from './weather-history.service';
import { WeatherHistoryStore } from './weather-history.store';

@Module({
  imports: [
    HttpModule,
    OrderReportingFactsModule,
    OrderMarketingUsageFactsModule,
    MarketingCampaignFactsModule,
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
        readItemsForStoreRange: (storeStableId, startDate, endDate) =>
          orders.readItemsForStoreRange(storeStableId, startDate, endDate),
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
      provide: REPORTING_MARKETING_CAMPAIGNS_QUERY,
      inject: [MARKETING_CAMPAIGN_FACTS_READER],
      useFactory: (
        campaigns: MarketingCampaignFactsReaderPort,
      ): ReportingMarketingCampaignsQueryPort => ({
        readCampaigns: async (query) => {
          const rows = await campaigns.readCampaigns(query);
          return rows.map((row) => ({
            activityStableId: row.activityStableId,
            kind: row.kind,
            scope: row.scope,
            storeStableId: row.storeStableId,
            titleZh: row.titleZh,
            titleEn: row.titleEn,
            subtype: row.subtype,
            lifecycleStatus: row.lifecycleStatus,
            validFrom: row.validFrom,
            validTo: row.validTo,
            weekdays: [...row.weekdays],
            startMinutes: row.startMinutes,
            endMinutes: row.endMinutes,
          }));
        },
        readCouponProgramAttributions: async (couponStableIds) => {
          const rows =
            await campaigns.readCouponProgramAttributions(couponStableIds);
          return rows.map((row) => ({ ...row }));
        },
      }),
    },
    {
      provide: REPORTING_MARKETING_USAGE_QUERY,
      inject: [ORDER_MARKETING_USAGE_FACTS_READER],
      useFactory: (
        usage: OrderMarketingUsageFactsReaderPort,
      ): ReportingMarketingUsageQueryPort => ({
        readUsageFactsForRange: async (query) => {
          const rows = await usage.readUsageFactsForRange(query);
          return rows.map((row) => ({
            orderStableId: row.orderStableId,
            storeStableId: row.storeStableId,
            occurredAt: row.occurredAt,
            activityStableId: row.activityStableId,
            source: row.source,
            affectedItemQuantity: row.affectedItemQuantity,
            affectedItemQuantityEvidence: row.affectedItemQuantityEvidence,
            discountCents: row.discountCents,
            discountEvidence: row.discountEvidence,
            associatedSalesCents: row.associatedSalesCents,
            associatedSalesEvidence: row.associatedSalesEvidence,
          }));
        },
      }),
    },
    {
      provide: REPORTING_STORE_LOCATION_QUERY,
      inject: [BRAND_STORE_CONFIG_READER],
      useFactory: (
        config: BrandStoreConfigReaderPort,
      ): ReportingStoreLocationQueryPort => ({
        getStoreLocationContext: async (storeStableId) => {
          const store = await config.getStoreSnapshot(storeStableId);
          return {
            storeStableId: store.storeStableId,
            timezone: store.timezone,
            latitude: store.latitude,
            longitude: store.longitude,
            countryCode: store.countryCode,
            province: store.province,
          };
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
    {
      provide: REPORTING_WEATHER_DB,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ReportingWeatherDbPort => ({
        readDailyFacts: async (query) =>
          prisma.reportingWeatherDailyFact.findMany({
            where: {
              storeStableId: query.storeStableId,
              localDate: { gte: query.from, lte: query.to },
            },
            orderBy: { localDate: 'asc' },
          }),
        upsertDailyFacts: async (rows) => {
          if (rows.length === 0) return;
          await prisma.$transaction(
            rows.map((row) =>
              prisma.reportingWeatherDailyFact.upsert({
                where: {
                  storeStableId_localDate: {
                    storeStableId: row.storeStableId,
                    localDate: row.localDate,
                  },
                },
                create: { ...row },
                update: {
                  timezone: row.timezone,
                  latitude: row.latitude,
                  longitude: row.longitude,
                  provider: row.provider,
                  sourceMethod: row.sourceMethod,
                  status: row.status,
                  observationHours: row.observationHours,
                  temperatureAvgC: row.temperatureAvgC,
                  temperatureMinC: row.temperatureMinC,
                  temperatureMaxC: row.temperatureMaxC,
                  precipitationMm: row.precipitationMm,
                  snowDepthMm: row.snowDepthMm,
                  windSpeedKph: row.windSpeedKph,
                  peakWindGustKph: row.peakWindGustKph,
                  sunshineMinutes: row.sunshineMinutes,
                  significantCondition: row.significantCondition,
                  refreshedAt: row.refreshedAt,
                },
              }),
            ),
          );
        },
      }),
    },
    MeteostatWeatherProvider,
    WeatherHistoryStore,
    {
      provide: REPORTING_WEATHER_PROVIDER,
      useExisting: MeteostatWeatherProvider,
    },
    {
      provide: REPORTING_WEATHER_HISTORY_STORE,
      useExisting: WeatherHistoryStore,
    },
    ReportsService,
    BusinessOperationsReportService,
    MarketingOverviewReportService,
    WeatherHistoryService,
    {
      provide: REPORTING_TOP_ITEMS_QUERY,
      useExisting: ReportsService,
    },
  ],
  exports: [REPORTING_TOP_ITEMS_QUERY],
})
export class ReportsModule {}
