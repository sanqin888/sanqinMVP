import {
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  UBER_EATS_REPORTING,
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
}
