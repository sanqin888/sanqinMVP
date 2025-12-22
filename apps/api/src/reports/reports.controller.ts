//Users/apple/sanqinMVP/apps/api/src/reports
import { Controller, Get, Query } from '@nestjs/common';
import { DailyReport, ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  async daily(@Query('date') date: string): Promise<DailyReport> {
    return this.reports.daily(date);
  }
}
