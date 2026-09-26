import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  UBER_EATS_REPORTING,
  type UberEatsFinancialReportType,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';
import { AccountingAutomationScheduler } from './accounting-automation.scheduler';
import { parseNonNegativeAccountingNumber } from './accounting-controller-support';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingAutomationController {
  constructor(
    private readonly automation: AccountingAutomationScheduler,
    @Inject(UBER_EATS_REPORTING)
    private readonly uberReporting: UberEatsReportingPort,
  ) {}

  @Post('automation/run')
  runAutomation() {
    return this.automation.runNow();
  }

  @Get('automation/settings')
  automationSettings() {
    return this.automation.getSettings();
  }

  @Put('automation/settings')
  updateAutomationSettings(
    @Body()
    body: {
      timezone?: string;
      runHour?: number;
      runMinute?: number;
      gmailEnabled?: boolean;
      uberReportsEnabled?: boolean;
      accountingStartDate?: string | null;
    },
  ) {
    return this.automation.updateSettings(body);
  }

  @Post('automation/uber-reports/request')
  requestUberReports(
    @Body()
    body: {
      startDate?: string;
      endDate?: string;
      reportTypes?: UberEatsFinancialReportType[];
    },
  ) {
    const startDate = this.requireBusinessDate(body.startDate, 'startDate');
    const endDate = this.requireBusinessDate(body.endDate, 'endDate');
    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
    const allowed = new Set<UberEatsFinancialReportType>([
      'PAYMENT_DETAILS_REPORT',
      'FINANCE_SUMMARY_REPORT',
    ]);
    if (body.reportTypes !== undefined && !Array.isArray(body.reportTypes)) {
      throw new BadRequestException('reportTypes must be an array');
    }
    const reportTypes: UberEatsFinancialReportType[] =
      body.reportTypes === undefined
        ? ['PAYMENT_DETAILS_REPORT', 'FINANCE_SUMMARY_REPORT']
        : Array.from(new Set(body.reportTypes));
    if (
      !reportTypes.length ||
      !reportTypes.every((reportType) => allowed.has(reportType))
    ) {
      throw new BadRequestException(
        'reportTypes must contain only PAYMENT_DETAILS_REPORT or FINANCE_SUMMARY_REPORT',
      );
    }
    return this.uberReporting.requestFinancialReports({
      startDate,
      endDate,
      reportTypes,
    });
  }

  @Get('automation/uber-reports')
  listUberReports(
    @Query('limit') limit?: string,
    @Query('status') status?: 'REQUESTED' | 'READY' | 'IMPORTED' | 'ERROR',
  ) {
    return this.uberReporting.listFinancialReports({
      limit: parseNonNegativeAccountingNumber(limit, 'limit'),
      status,
    });
  }

  private requireBusinessDate(
    value: string | undefined,
    field: string,
  ): string {
    const normalized = value?.trim() ?? '';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
      !DateTime.fromISO(normalized, { zone: 'utc' }).isValid
    ) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD`);
    }
    return normalized;
  }
}
