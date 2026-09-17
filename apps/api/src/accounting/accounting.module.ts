import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
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
import { AccountingImageRetentionService } from './accounting-image-retention.service';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';
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
  controllers: [AccountingController],
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
    AccountingInboxAcquisitionService,
    AccountingImageRetentionService,
    AccountingProviderFinancialHistoryService,
    AccountingGmailIngestService,
    AccountingAutomationScheduler,
  ],
})
export class AccountingModule {}
