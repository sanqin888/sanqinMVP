// apps/api/src/reports/reports.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { BusinessOperationsReportService } from './business-operations-report.service';

@Controller('reports')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF') // 只有管理员和员工可以查看
export class ReportsController {
  constructor(
    private readonly businessOperations: BusinessOperationsReportService,
  ) {}

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
}
