import { Module } from '@nestjs/common';
import { AccountingAuditController } from './accounting-audit.controller';
import { AccountingAutomationController } from './accounting-automation.controller';
import { AccountingCanonicalChangeController } from './accounting-canonical-change.controller';
import { AccountingCanonicalSaleController } from './accounting-canonical-sale.controller';
import { AccountingChartController } from './accounting-chart.controller';
import { AccountingExpenseController } from './accounting-expense.controller';
import { AccountingInboxArtifactsController } from './accounting-inbox-artifacts.controller';
import { AccountingInboxController } from './accounting-inbox.controller';
import { AccountingPeriodController } from './accounting-period.controller';
import { AccountingProviderFinancialController } from './accounting-provider-financial.controller';
import { AccountingProviderSettlementController } from './accounting-provider-settlement.controller';
import { AccountingReportsController } from './accounting-reports.controller';
import { AccountingPayrollController } from './payroll/accounting-payroll.controller';
import { AccountingService } from './accounting.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingJournalService } from './accounting-journal.service';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { ACCOUNTING_DB } from './accounting-db';
import { AuthModule } from '../auth/auth.module';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { AccountingAutomationScheduler } from './accounting-automation.scheduler';
import { AccountingGmailIngestService } from './accounting-gmail-ingest.service';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
import { AccountingArtifactDeliveryService } from './accounting-artifact-delivery.service';
import {
  AccountingEvidenceFileManagerService,
} from './accounting-evidence-file-manager.service';
import { AccountingImageRetentionService } from './accounting-image-retention.service';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';
import { AccountingProviderFinancialReviewService } from './accounting-provider-financial-review.service';
import { AccountingProviderFinancialHistoryService } from './accounting-provider-financial-history.service';
import { AccountingChartService } from './accounting-chart.service';
import { AccountingExpenseService } from './accounting-expense.service';
import { AccountingFinancialReportsService } from './accounting-financial-reports.service';
import { AccountingInboxService } from './accounting-inbox.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import { AccountingCanonicalSalePostingService } from './accounting-canonical-sale-posting.service';
import { AccountingCanonicalSaleReplayService } from './accounting-canonical-sale-replay.service';
import { AccountingCanonicalChangePreviewService } from './accounting-canonical-change-preview.service';
import { AccountingCanonicalChangeExecutionService } from './accounting-canonical-change-execution.service';
import { AccountingProviderSettlementPreviewService } from './accounting-provider-settlement-preview.service';
import { AccountingProviderSettlementExecutionService } from './accounting-provider-settlement-execution.service';
import { AccountingPayrollConfigService } from './payroll/accounting-payroll-config.service';
import { AccountingPayrollEmployeeService } from './payroll/accounting-payroll-employee.service';
import { AccountingPayrollOpeningService } from './payroll/accounting-payroll-opening.service';
import { AccountingPayrollRunService } from './payroll/accounting-payroll-run.service';
import { AccountingPayrollFinalizationService } from './payroll/accounting-payroll-finalization.service';
import { AccountingPayrollYtdService } from './payroll/accounting-payroll-ytd.service';
import { AccountingPayrollPayStatementService } from './payroll/accounting-payroll-pay-statement.service';
import { AccountingPayrollPostingService } from './payroll/accounting-payroll-posting.service';
import { AccountingPayrollEmployeePaymentService } from './payroll/accounting-payroll-employee-payment.service';
import { AccountingPayrollCraRemittanceService } from './payroll/accounting-payroll-cra-remittance.service';
import { AccountingPayrollReversalService } from './payroll/accounting-payroll-reversal.service';
import { BrandStoreConfigModule } from '../store/public-api';
import { LoyaltyFinancialFactsModule } from '../loyalty/public-api';
import {
  OrderFinancialChangeFactsModule,
  OrderFinancialFactsModule,
  OrderReportingFactsModule,
} from '../orders/public-api';
import { PaymentFinancialFactsModule } from '../payments/public-api';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UberEatsModule,
    BrandStoreConfigModule,
    LoyaltyFinancialFactsModule,
    OrderFinancialFactsModule,
    OrderFinancialChangeFactsModule,
    OrderReportingFactsModule,
    PaymentFinancialFactsModule,
  ],
  controllers: [
    AccountingChartController,
    AccountingExpenseController,
    AccountingInboxController,
    AccountingInboxArtifactsController,
    AccountingProviderFinancialController,
    AccountingAutomationController,
    AccountingPeriodController,
    AccountingCanonicalSaleController,
    AccountingCanonicalChangeController,
    AccountingProviderSettlementController,
    AccountingReportsController,
    AccountingAuditController,
    AccountingPayrollController,
  ],
  providers: [
    { provide: ACCOUNTING_DB, useExisting: PrismaService },
    AccountingPeriodService,
    AccountingJournalService,
    AccountingService,
    AccountingCanonicalSalePostingService,
    AccountingCanonicalSaleReplayService,
    AccountingCanonicalChangePreviewService,
    AccountingCanonicalChangeExecutionService,
    AccountingProviderSettlementPreviewService,
    AccountingProviderSettlementExecutionService,
    AccountingChartService,
    AccountingExpenseService,
    AccountingFinancialReportsService,
    AccountingInboxService,
    AccountingProviderSettlementQueryService,
    AccountingProviderFinancialService,
    AccountingProviderFinancialReviewService,
    AccountingInboxAcquisitionService,
    AccountingArtifactDeliveryService,
    AccountingEvidenceFileManagerService,
    AccountingImageRetentionService,
    AccountingProviderFinancialHistoryService,
    AccountingGmailIngestService,
    AccountingAutomationScheduler,
    AccountingPayrollConfigService,
    AccountingPayrollEmployeeService,
    AccountingPayrollOpeningService,
    AccountingPayrollRunService,
    AccountingPayrollFinalizationService,
    AccountingPayrollYtdService,
    AccountingPayrollPayStatementService,
    AccountingPayrollPostingService,
    AccountingPayrollEmployeePaymentService,
    AccountingPayrollCraRemittanceService,
    AccountingPayrollReversalService,
  ],
})
export class AccountingModule {}
