import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  AccountingAccountType,
  AccountingTxType,
} from './accounting-contracts';
import { AccountingChartService } from './accounting-chart.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingChartController {
  constructor(private readonly chart: AccountingChartService) {}

  @Post('setup/initialize')
  initializeAccounting() {
    return this.chart.initializeDefaults();
  }

  @Post('accounts')
  async createAccount(
    @Body()
    body: {
      name: string;
      type: AccountingAccountType;
      currency?: string;
      includeFundedExpensesInManagementReports?: boolean;
    },
  ) {
    return this.chart.createAccount(body);
  }

  @Get('accounts')
  async listAccounts() {
    return this.chart.listAccounts();
  }

  @Get('categories')
  async categories(@Query('includeInactive') includeInactive?: string) {
    return this.chart.listCategories(includeInactive === 'true');
  }

  @Post('categories')
  async createCategory(
    @Body()
    body: {
      name: string;
      type: AccountingTxType;
      parentStableId?: string | null;
      sortOrder?: number;
    },
  ) {
    return this.chart.createCategory(body);
  }

  @Put('categories/:categoryStableId')
  async updateCategory(
    @Param('categoryStableId') categoryStableId: string,
    @Body()
    body: {
      name?: string;
      parentStableId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.chart.updateCategory(categoryStableId, body);
  }
}
