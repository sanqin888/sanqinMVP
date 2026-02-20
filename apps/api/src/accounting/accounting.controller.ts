import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AccountingSourceType, AccountingTxType, SettlementPlatform } from '@prisma/client';
import type { Request, Response } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountingService } from './accounting.service';

type TxBody = {
  type: AccountingTxType;
  source: AccountingSourceType;
  amountCents: number;
  currency?: string;
  occurredAt: string;
  categoryId: string;
  accountId?: string | null;
  toAccountId?: string | null;
  orderId?: string | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
};

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('tx')
  async createTx(
    @Body() body: TxBody,
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.accountingService.createTx(body, req.user?.id ?? 'unknown');
  }

  @Get('tx')
  async listTx(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
    @Query('source') source?: AccountingSourceType,
    @Query('keyword') keyword?: string,
  ) {
    return this.accountingService.listTx({
      from,
      to,
      categoryId,
      source,
      keyword,
    });
  }

  @Put('tx/:txStableId')
  async updateTx(
    @Param('txStableId') txStableId: string,
    @Body() body: TxBody,
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.accountingService.updateTx(
      txStableId,
      body,
      req.user?.id ?? 'unknown',
    );
  }

  @Delete('tx/:txStableId')
  async deleteTx(
    @Param('txStableId') txStableId: string,
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.accountingService.deleteTx(
      txStableId,
      req.user?.id ?? 'unknown',
    );
  }

  @Post('period-close/month/:periodKey')
  async closeMonth(
    @Param('periodKey') periodKey: string,
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.accountingService.closeMonth(
      periodKey,
      req.user?.id ?? 'unknown',
    );
  }

  @Get('period-close/month')
  async listMonthCloseStatus(@Query('periodKeys') periodKeys?: string) {
    const keys = periodKeys
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return this.accountingService.listPeriodCloseStatus(keys);
  }

  @Get('report/pnl')
  async getPnlReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'month' | 'quarter' | 'year',
  ) {
    return this.accountingService.pnlReport({ from, to, groupBy });
  }



  @Post('automation/order-accrual')
  async autoAccrueOrderRevenue(
    @Body() body: {
      date: string;
      categoryId: string;
      accountId?: string;
      mode?: 'DAILY' | 'PER_ORDER';
    },
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.accountingService.autoAccrueOrderRevenue(
      body,
      req.user?.id ?? 'unknown',
    );
  }

  @Post('reconciliation/platform/import-csv')
  async importSettlementCsv(
    @Body() body: {
      platform: SettlementPlatform;
      csv: string;
      importBatchId?: string;
    },
  ) {
    return this.accountingService.importPlatformSettlementCsv(body);
  }

  @Get('reconciliation/platform/:platform')
  async reconcilePlatform(
    @Param('platform') platform: SettlementPlatform,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.reconcilePlatform(platform, from, to);
  }

  @Post('accounts')
  async createAccount(
    @Body() body: { name: string; type: 'CASH' | 'BANK' | 'PLATFORM_WALLET'; currency?: string },
  ) {
    return this.accountingService.createAccount(body);
  }

  @Get('accounts')
  async listAccounts() {
    return this.accountingService.listAccounts();
  }

  @Get('report/account-balance')
  async accountBalanceReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.accountBalanceReport(from, to);
  }


  @Get('report/annual/:year')
  async annualReport(@Param('year') year: string) {
    return this.accountingService.annualReport(Number(year));
  }

  @Get('report/cashflow')
  async cashflowOverview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.cashflowOverview({ from, to });
  }

  @Get('report/slice')
  async dimensionSlice(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.dimensionSlice({ from, to });
  }
  @Get('audit-logs')
  async listAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('operatorUserId') operatorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.listAuditLogs({
      entityType,
      entityId,
      operatorUserId,
      from,
      to,
    });
  }

  @Get('export/tx.csv')
  async exportTxCsv(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('source') source: AccountingSourceType | undefined,
    @Query('keyword') keyword: string | undefined,
    @Req() req: Request & { user?: { id?: string } },
    @Res() res: Response,
  ) {
    const csv = await this.accountingService.exportTxCsv(
      { from, to, categoryId, source, keyword },
      req.user?.id ?? 'unknown',
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
    @Req() req: Request & { user?: { id?: string } },
    @Res() res: Response,
  ) {
    const csv = await this.accountingService.exportPnlTemplate(
      template,
      { from, to, groupBy },
      req.user?.id ?? 'unknown',
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
    @Req() req: Request & { user?: { id?: string } },
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.accountingService.exportPnlPdf(
      template,
      { from, to, groupBy },
      req.user?.id ?? 'unknown',
    );

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="accounting-report-${template.toLowerCase()}-${ts}.pdf"`,
    );
    return res.send(pdfBuffer);
  }

  @Get('categories')
  async categories() {
    return this.accountingService.listCategories();
  }
}
