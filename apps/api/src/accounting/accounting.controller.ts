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
import { AccountingSourceType, AccountingTxType } from '@prisma/client';
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
  orderId?: string | null;
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
    return this.accountingService.deleteTx(txStableId, req.user?.id ?? 'unknown');
  }

  @Get('report/pnl')
  async getPnlReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'month' | 'quarter' | 'year',
  ) {
    return this.accountingService.pnlReport({ from, to, groupBy });
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
    res.setHeader('Content-Disposition', `attachment; filename="accounting-transactions-${ts}.csv"`);
    return res.send(csv);
  }

  @Get('categories')
  async categories() {
    return this.accountingService.listCategories();
  }
}
