// apps/api/src/reports/reports.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { BusinessOperationsReportService } from './business-operations-report.service';
import { CalendarContextService } from './calendar-context.service';
import { MarketingOverviewReportService } from './marketing-overview-report.service';
import { WeatherHistoryService } from './weather-history.service';

@Controller('reports')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF') // 只有管理员和员工可以查看
export class ReportsController {
  constructor(
    private readonly businessOperations: BusinessOperationsReportService,
    private readonly marketingOverview: MarketingOverviewReportService,
    private readonly weatherHistory: WeatherHistoryService,
    private readonly calendarContext: CalendarContextService,
  ) {}

  @Get('marketing')
  async getMarketingOverview(@Query('storeStableId') storeStableId?: string) {
    return await this.marketingOverview.getReport(storeStableId ?? '');
  }

  @Get('business')
  async getBusinessReport(
    @Query('storeStableId') storeStableId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.businessOperations.getReport({
      storeStableId: storeStableId ?? '',
      from,
      to,
    });
  }

  @Get('weather-history')
  async getWeatherHistory(
    @Query('storeStableId') storeStableId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.weatherHistory.getReport({
      storeStableId: storeStableId ?? '',
      from,
      to,
    });
  }

  @Get('calendar-context')
  async getCalendarContext(
    @Query('storeStableId') storeStableId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return await this.calendarContext.getReport({
      storeStableId: storeStableId ?? '',
      from,
      to,
    });
  }
}
