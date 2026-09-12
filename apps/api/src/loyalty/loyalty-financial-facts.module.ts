import { Module } from '@nestjs/common';

import { LOYALTY_FINANCIAL_FACTS_READER } from './loyalty-financial-facts-reader.contract';
import { LoyaltyFinancialFactsReaderService } from './loyalty-financial-facts-reader.service';
import { PrismaModule } from './loyalty-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    LoyaltyFinancialFactsReaderService,
    {
      provide: LOYALTY_FINANCIAL_FACTS_READER,
      useExisting: LoyaltyFinancialFactsReaderService,
    },
  ],
  exports: [LOYALTY_FINANCIAL_FACTS_READER],
})
export class LoyaltyFinancialFactsModule {}
