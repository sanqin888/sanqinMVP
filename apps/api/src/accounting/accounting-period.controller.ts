import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingPeriodService } from './accounting-period.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingPeriodController {
  constructor(private readonly period: AccountingPeriodService) {}

  @Post('period-close/month/:periodKey')
  async closeMonth(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.period.closeMonth(
      periodKey,
      requireAccountingOperatorUserId(req),
    );
  }

  @Delete('period-close/month/:periodKey')
  async reopenMonth(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.period.reopenMonth(
      periodKey,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('period-close/month')
  async listMonthCloseStatus(@Query('periodKeys') periodKeys?: string) {
    const keys = periodKeys
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return this.period.listPeriodCloseStatus(keys);
  }

  @Post('period-close/year/:periodKey')
  async closeYear(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.period.closeYear(
      periodKey,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('period-close/year')
  async listYearCloseStatus(@Query('periodKeys') periodKeys?: string) {
    const keys = periodKeys
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return this.period.listYearCloseStatus(keys);
  }
}
