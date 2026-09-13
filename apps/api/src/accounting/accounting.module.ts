import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { AccountingAutomationScheduler } from './accounting-automation.scheduler';
import { AccountingGmailIngestService } from './accounting-gmail-ingest.service';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';
import { AccountingProviderFinancialHistoryService } from './accounting-provider-financial-history.service';
import { AccountingOperationsService } from './accounting-operations.service';
import { AccountingCanonicalSalePostingService } from './accounting-canonical-sale-posting.service';
import { AccountingCanonicalSaleReplayService } from './accounting-canonical-sale-replay.service';
import { BrandStoreConfigModule } from '../store/public-api';
import { LoyaltyFinancialFactsModule } from '../loyalty/public-api';
import { OrderFinancialFactsModule } from '../orders/public-api';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UberEatsModule,
    BrandStoreConfigModule,
    LoyaltyFinancialFactsModule,
    OrderFinancialFactsModule,
  ],
  controllers: [AccountingController],
  providers: [
    AccountingService,
    AccountingCanonicalSalePostingService,
    AccountingCanonicalSaleReplayService,
    AccountingOperationsService,
    AccountingProviderFinancialService,
    AccountingInboxAcquisitionService,
    AccountingProviderFinancialHistoryService,
    AccountingGmailIngestService,
    AccountingAutomationScheduler,
  ],
})
export class AccountingModule {}
