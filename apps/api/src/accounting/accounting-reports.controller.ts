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
  parseNonNegativeAccountingNumber,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import { AccountingBalanceMovementService } from './accounting-balance-movement.service';
import { AccountingFinancialReportsService } from './accounting-financial-reports.service';
import { AccountingSalesAnalyticsService } from './accounting-sales-analytics.service';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';
import { AccountingTrialBalanceService } from './accounting-trial-balance.service';
import type { AccountingStatementDrillThroughPhaseV1 } from './accounting-statement-drill-through.contract';
import { AccountingStatementDrillThroughService } from './accounting-statement-drill-through.service';
import { AccountingStatementExportService } from './accounting-statement-export.service';
import { AccountingCloverPreSyncAuthorityService } from './accounting-clover-pre-sync-authority.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingReportsController {
  constructor(
    private readonly reports: AccountingFinancialReportsService,
    private readonly salesAnalytics: AccountingSalesAnalyticsService,
    private readonly balanceMovement: AccountingBalanceMovementService,
    private readonly trialBalance: AccountingTrialBalanceService,
    private readonly statementDrillThrough: AccountingStatementDrillThroughService,
    private readonly statementExport: AccountingStatementExportService,
    private readonly cloverPreSyncAuthority: AccountingCloverPreSyncAuthorityService,
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

  @Get('report/sales')
  async salesReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.salesAnalytics.report({ from, to });
  }

  @Get('report/clover-pre-sync-authority-shadow')
  cloverPreSyncAuthorityShadow(
    @Query('storeStableId') storeStableId?: string,
    @Query('statementDocumentStableId') statementDocumentStableId?: string,
  ) {
    return this.cloverPreSyncAuthority.shadow({
      storeStableId: storeStableId ?? '',
      ...(statementDocumentStableId ? { statementDocumentStableId } : {}),
    });
  }

  @Get('report/trial-balance')
  trialBalanceReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ): Promise<AccountingTrialBalanceReportV1> {
    return this.trialBalance.project({ from, to, currency });
  }

  @Get('report/balance-movement')
  balanceMovementReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ): Promise<AccountingBalanceMovementReportV1> {
    return this.balanceMovement.project({ from, to, currency });
  }

  @Get('report/statement-journals')
  statementJournals(
    @Query('accountStableId') accountStableId: string,
    @Query('phase') phase: AccountingStatementDrillThroughPhaseV1,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.statementDrillThrough.read({
      accountStableId,
      phase,
      from,
      to,
      currency,
      limit: parseNonNegativeAccountingNumber(limit, 'limit'),
      offset: parseNonNegativeAccountingNumber(offset, 'offset'),
    });
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

  @Get('export/trial-balance.csv')
  async exportTrialBalanceCsv(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('currency') currency: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const csv = await this.statementExport.exportTrialBalanceCsv(
      { from, to, currency },
      requireAccountingOperatorUserId(req),
    );
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-trial-balance-${ts}.csv"`,
    );
    return res.send(csv);
  }

  @Get('export/trial-balance.pdf')
  async exportTrialBalancePdf(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('currency') currency: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const pdf = await this.statementExport.exportTrialBalancePdf(
      { from, to, currency },
      requireAccountingOperatorUserId(req),
    );
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-trial-balance-${ts}.pdf"`,
    );
    return res.send(pdf);
  }

  @Get('export/balance-movement.csv')
  async exportBalanceMovementCsv(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('currency') currency: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const csv = await this.statementExport.exportBalanceMovementCsv(
      { from, to, currency },
      requireAccountingOperatorUserId(req),
    );
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-balance-movement-${ts}.csv"`,
    );
    return res.send(csv);
  }

  @Get('export/balance-movement.pdf')
  async exportBalanceMovementPdf(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('currency') currency: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const pdf = await this.statementExport.exportBalanceMovementPdf(
      { from, to, currency },
      requireAccountingOperatorUserId(req),
    );
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-balance-movement-${ts}.pdf"`,
    );
    return res.send(pdf);
  }
}
