import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingFinancialReportsService } from './accounting-financial-reports.service';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingReportsController {
  constructor(
    private readonly reports: AccountingFinancialReportsService,
    private readonly accountingService: AccountingService,
  ) {}

  @Get('dashboard')
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    const resolvedTo = to?.trim() || now.toISOString().slice(0, 10);
    const resolvedFrom =
      from?.trim() ||
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return this.reports.dashboard(resolvedFrom, resolvedTo);
  }

  @Get('report/pnl')
  async getPnlReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'month' | 'quarter' | 'year',
  ) {
    return this.reports.pnlReport({ from, to, groupBy });
  }

  @Get('report/account-balance')
  async accountBalanceReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.accountBalanceReport(from, to);
  }

  @Get('report/annual/:year')
  async annualReport(@Param('year') year: string) {
    return this.reports.annualReport(Number(year));
  }

  @Get('report/cashflow')
  async cashflowOverview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.cashflowOverview({ from, to });
  }

  @Get('report/slice')
  async dimensionSlice(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.dimensionSlice({ from, to });
  }

  @Get('export/tx.csv')
  async exportTxCsv(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('categoryStableId') categoryStableId: string | undefined,
    @Query('source') source: string | undefined,
    @Query('keyword') keyword: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportTxCsv(
      { from, to, categoryStableId, source, keyword },
      requireAccountingOperatorUserId(req),
    );

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-transactions-${ts}.csv"`,
    );
    return res.send(csv);
  }

  @Get('export/report.csv')
  async exportReportCsv(
    @Query('template') template: 'MANAGEMENT' | 'BOSS' = 'MANAGEMENT',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('groupBy') groupBy: 'month' | 'quarter' | 'year' | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportPnlTemplate(
      template,
      { from, to, groupBy },
      requireAccountingOperatorUserId(req),
    );

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-report-${template.toLowerCase()}-${ts}.csv"`,
    );
    return res.send(csv);
  }

  @Get('export/report.pdf')
  async exportReportPdf(
    @Query('template') template: 'MANAGEMENT' | 'BOSS' = 'MANAGEMENT',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('groupBy') groupBy: 'month' | 'quarter' | 'year' | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reports.exportPnlPdf(
      template,
      { from, to, groupBy },
      requireAccountingOperatorUserId(req),
    );

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-report-${template.toLowerCase()}-${ts}.pdf"`,
    );
    return res.send(pdfBuffer);
  }
}
