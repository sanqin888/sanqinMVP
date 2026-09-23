import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { writeAccountingAuditLog } from './accounting-audit-writer';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingBalanceMovementService } from './accounting-balance-movement.service';
import {
  renderAccountingBalanceMovementCsv,
  renderAccountingBalanceMovementPdf,
  renderAccountingTrialBalanceCsv,
  renderAccountingTrialBalancePdf,
} from './accounting-statement-export';
import { AccountingTrialBalanceService } from './accounting-trial-balance.service';

type StatementExportQuery = {
  from?: string;
  to?: string;
  currency?: string;
};

@Injectable()
export class AccountingStatementExportService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly db: AccountingDb,
    private readonly trialBalance: AccountingTrialBalanceService,
    private readonly balanceMovement: AccountingBalanceMovementService,
  ) {}

  async exportTrialBalanceCsv(
    query: StatementExportQuery,
    operatorActorRef: string,
  ): Promise<string> {
    const report = await this.trialBalance.project(query);
    const csv = renderAccountingTrialBalanceCsv(report);
    await this.auditExport(
      'TRIAL_BALANCE',
      'CSV',
      report,
      query,
      operatorActorRef,
    );
    return csv;
  }

  async exportTrialBalancePdf(
    query: StatementExportQuery,
    operatorActorRef: string,
  ): Promise<Buffer> {
    const report = await this.trialBalance.project(query);
    const pdf = await renderAccountingTrialBalancePdf(report);
    await this.auditExport(
      'TRIAL_BALANCE',
      'PDF',
      report,
      query,
      operatorActorRef,
    );
    return pdf;
  }

  async exportBalanceMovementCsv(
    query: StatementExportQuery,
    operatorActorRef: string,
  ): Promise<string> {
    const report = await this.balanceMovement.project(query);
    const csv = renderAccountingBalanceMovementCsv(report);
    await this.auditExport(
      'BALANCE_MOVEMENT',
      'CSV',
      report,
      query,
      operatorActorRef,
    );
    return csv;
  }

  async exportBalanceMovementPdf(
    query: StatementExportQuery,
    operatorActorRef: string,
  ): Promise<Buffer> {
    const report = await this.balanceMovement.project(query);
    const pdf = await renderAccountingBalanceMovementPdf(report);
    await this.auditExport(
      'BALANCE_MOVEMENT',
      'PDF',
      report,
      query,
      operatorActorRef,
    );
    return pdf;
  }

  private async auditExport(
    statement: 'TRIAL_BALANCE' | 'BALANCE_MOVEMENT',
    format: 'CSV' | 'PDF',
    report: {
      currency: string;
      requestedFrom: string;
      requestedTo: string;
      effectiveFrom: string;
      effectiveTo: string;
      scope: string;
    },
    query: StatementExportQuery,
    operatorActorRef: string,
  ): Promise<void> {
    await writeAccountingAuditLog(this.db, {
      action: 'EXPORT_STATEMENT',
      entityType: 'ACCOUNTING_REPORT',
      entityId: statement,
      operatorActorRef,
      afterJson: {
        statement,
        format,
        query: {
          from: query.from ?? null,
          to: query.to ?? null,
          currency: query.currency ?? null,
        },
        scope: report.scope,
        currency: report.currency,
        requestedFrom: report.requestedFrom,
        requestedTo: report.requestedTo,
        effectiveFrom: report.effectiveFrom,
        effectiveTo: report.effectiveTo,
      } as Prisma.JsonObject,
    });
  }
}
