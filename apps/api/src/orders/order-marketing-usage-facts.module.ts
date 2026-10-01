import { Module } from '@nestjs/common';

import { OrderFinancialFactsModule } from './order-financial-facts.module';
import { ORDER_MARKETING_USAGE_FACTS_READER } from './order-marketing-usage-facts-reader.contract';
import { OrderMarketingUsageFactsReaderService } from './order-marketing-usage-facts-reader.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule, OrderFinancialFactsModule],
  providers: [
    OrderMarketingUsageFactsReaderService,
    {
      provide: ORDER_MARKETING_USAGE_FACTS_READER,
      useExisting: OrderMarketingUsageFactsReaderService,
    },
  ],
  exports: [ORDER_MARKETING_USAGE_FACTS_READER],
})
export class OrderMarketingUsageFactsModule {}
