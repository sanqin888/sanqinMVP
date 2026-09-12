import { Module } from '@nestjs/common';

import { ORDER_FINANCIAL_FACTS_READER } from './order-financial-facts-reader.contract';
import { OrderFinancialFactsReaderService } from './order-financial-facts-reader.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderFinancialFactsReaderService,
    {
      provide: ORDER_FINANCIAL_FACTS_READER,
      useExisting: OrderFinancialFactsReaderService,
    },
  ],
  exports: [ORDER_FINANCIAL_FACTS_READER],
})
export class OrderFinancialFactsModule {}
