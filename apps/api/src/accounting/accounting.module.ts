import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { AccountingAutomationScheduler } from './accounting-automation.scheduler';
import { AccountingGmailIngestService } from './accounting-gmail-ingest.service';
import { AccountingOperationsService } from './accounting-operations.service';

@Module({
  imports: [PrismaModule, AuthModule, UberEatsModule],
  controllers: [AccountingController],
  providers: [
    AccountingService,
    AccountingOperationsService,
    AccountingGmailIngestService,
    AccountingAutomationScheduler,
  ],
})
export class AccountingModule {}
