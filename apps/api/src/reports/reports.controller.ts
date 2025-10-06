import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import type { DailyReport } from './reports.service';

@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  async daily(@Query('date') date: string): Promise<DailyReport> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format, expected YYYY-MM-DD');
    }
    return this.reports.getDailyReport(date);
  }
}
