import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  NotFoundException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  AccountingDocumentStatus,
  AccountingSourceType,
  AccountingTxType,
  SettlementPlatform,
} from '@prisma/client';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { getUploadsAccountingDir } from '../common/utils/uploads-path';
import { AccountingService } from './accounting.service';
import { AccountingAutomationScheduler } from './accounting-automation.scheduler';
import {
  AccountingOperationsService,
  type AccountingExpenseInput,
} from './accounting-operations.service';
import {
  UBER_EATS_REPORTING,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';

type AuthedAccountingRequest = Request & {
  user?: { id?: string; userStableId?: string };
};

type TxBody = {
  type: AccountingTxType;
  source: AccountingSourceType;
  amountCents: number;
  currency?: string;
  occurredAt: string;
  categoryStableId: string;
  accountStableId?: string | null;
  toAccountStableId?: string | null;
  orderId?: string | null;
  idempotencyKey?: string | null;
  externalRef?: string | null;
  counterparty?: string | null;
  memo?: string | null;
  attachmentUrls?: string[];
  lastKnownUpdatedAt?: string;
};

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly operations: AccountingOperationsService,
    private readonly automation: AccountingAutomationScheduler,
    @Inject(UBER_EATS_REPORTING)
    private readonly uberReporting: UberEatsReportingPort,
  ) {}

  private parseNonNegativeNumber(
    raw: string | undefined,
    fieldName: string,
  ): number | undefined {
    if (raw == null || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }
    return value;
  }

  private requireOperatorUserId(req: AuthedAccountingRequest) {
    const operatorUserId = req.user?.userStableId?.trim();
    if (!operatorUserId) {
      throw new UnauthorizedException('operator stable user id is required');
    }
    return operatorUserId;
  }

  @Post('setup/initialize')
  initializeAccounting() {
    return this.operations.initializeDefaults();
  }

  @Get('dashboard')
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    const resolvedTo = to?.trim() || now.toISOString().slice(0, 10);
    const resolvedFrom =
      from?.trim() ||
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return this.operations.dashboard(resolvedFrom, resolvedTo);
  }

  @Post('expenses')
  createExpense(
    @Body() body: AccountingExpenseInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.operations.createExpense(body, this.requireOperatorUserId(req));
  }

  @Get('expenses')
  listExpenses(
    @Query('status') status?: AccountingDocumentStatus,
    @Query('limit') limit?: string,
  ) {
    return this.operations.listExpenseDocuments({
      status,
      limit: this.parseNonNegativeNumber(limit, 'limit'),
    });
  }

  @Get('inbox')
  inbox(@Query('limit') limit?: string) {
    return this.operations.listExpenseDocuments({
      status: AccountingDocumentStatus.PENDING_REVIEW,
      limit: this.parseNonNegativeNumber(limit, 'limit'),
    });
  }

  @Post('inbox/:documentStableId/confirm')
  confirmInboxDocument(
    @Param('documentStableId') documentStableId: string,
    @Body() body: AccountingExpenseInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.operations.confirmInboxDocument(
      documentStableId,
      body,
      this.requireOperatorUserId(req),
    );
  }

  @Post('files/receipts')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadReceipt(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return { url: await this.operations.saveReceiptImage(file) };
  }

  @Get('files/:kind/:fileName')
  accountingFile(
    @Param('kind') kind: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const safeName = path.basename(fileName);
    const extension = path.extname(safeName).toLowerCase();
    const contentType =
      kind === 'bills' && extension === '.pdf'
        ? 'application/pdf'
        : kind === 'uber-reports' && extension === '.csv'
          ? 'text/csv; charset=utf-8'
          : kind === 'receipts' && extension === '.jpg'
            ? 'image/jpeg'
            : kind === 'receipts' && extension === '.png'
              ? 'image/png'
              : kind === 'receipts' && extension === '.webp'
                ? 'image/webp'
                : null;
    if (!contentType || safeName !== fileName) {
      throw new NotFoundException('accounting file not found');
    }
    const filePath = path.join(getUploadsAccountingDir(), kind, safeName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('accounting file not found');
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(filePath);
  }

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
      limit: this.parseNonNegativeNumber(limit, 'limit'),
      status,
    });
  }

  @Post('tx')
  async createTx(@Body() body: TxBody, @Req() req: AuthedAccountingRequest) {
    return this.accountingService.createTx(
      body,
      this.requireOperatorUserId(req),
    );
  }

  @Get('tx')
  async listTx(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryStableId') categoryStableId?: string,
    @Query('source') source?: AccountingSourceType,
    @Query('keyword') keyword?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.accountingService.listTx({
      from,
      to,
      categoryStableId,
      source,
      keyword,
      limit: this.parseNonNegativeNumber(limit, 'limit'),
      offset: this.parseNonNegativeNumber(offset, 'offset'),
      cursor,
    });
  }

  @Put('tx/:txStableId')
  async updateTx(
    @Param('txStableId') txStableId: string,
    @Body() body: TxBody,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.updateTx(
      txStableId,
      body,
      this.requireOperatorUserId(req),
    );
  }

  @Delete('tx/:txStableId')
  async deleteTx(
    @Param('txStableId') txStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.deleteTx(
      txStableId,
      this.requireOperatorUserId(req),
    );
  }

  @Post('period-close/month/:periodKey')
  async closeMonth(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.closeMonth(
      periodKey,
      this.requireOperatorUserId(req),
    );
  }

  @Delete('period-close/month/:periodKey')
  async reopenMonth(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.reopenMonth(
      periodKey,
      this.requireOperatorUserId(req),
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

  @Post('period-close/year/:periodKey')
  async closeYear(
    @Param('periodKey') periodKey: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.closeYear(
      periodKey,
      this.requireOperatorUserId(req),
    );
  }

  @Get('period-close/year')
  async listYearCloseStatus(@Query('periodKeys') periodKeys?: string) {
    const keys = periodKeys
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return this.accountingService.listYearCloseStatus(keys);
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
    @Body()
    body: {
      date: string;
      categoryStableId: string;
      accountStableId?: string;
      mode?: 'DAILY' | 'PER_ORDER';
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.accountingService.autoAccrueOrderRevenue(
      body,
      this.requireOperatorUserId(req),
    );
  }

  @Post('reconciliation/platform/import-csv')
  async importSettlementCsv(
    @Body()
    body: {
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
    @Body()
    body: {
      name: string;
      type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
      currency?: string;
    },
  ) {
    return this.operations.createAccount(body);
  }

  @Get('accounts')
  async listAccounts() {
    return this.operations.listAccounts();
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
  async dimensionSlice(@Query('from') from?: string, @Query('to') to?: string) {
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
    @Query('categoryStableId') categoryStableId: string | undefined,
    @Query('source') source: AccountingSourceType | undefined,
    @Query('keyword') keyword: string | undefined,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const csv = await this.accountingService.exportTxCsv(
      { from, to, categoryStableId, source, keyword },
      this.requireOperatorUserId(req),
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
    const csv = await this.accountingService.exportPnlTemplate(
      template,
      { from, to, groupBy },
      this.requireOperatorUserId(req),
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
    const pdfBuffer = await this.accountingService.exportPnlPdf(
      template,
      { from, to, groupBy },
      this.requireOperatorUserId(req),
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
  async categories(@Query('includeInactive') includeInactive?: string) {
    return this.operations.listCategories(includeInactive === 'true');
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
    return this.operations.createCategory(body);
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
    return this.operations.updateCategory(categoryStableId, body);
  }
}
