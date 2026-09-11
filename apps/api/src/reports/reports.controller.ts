// apps/api/src/reports/reports.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';

@Controller('reports')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF') // 只有管理员和员工可以查看
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async getReport(@Query('from') from?: string, @Query('to') to?: string) {
    return await this.reportsService.getReport({ from, to });
  }
}
