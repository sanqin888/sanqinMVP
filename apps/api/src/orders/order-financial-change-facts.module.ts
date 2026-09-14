import { Module } from '@nestjs/common';

import { ORDER_FINANCIAL_CHANGE_FACTS_READER } from './order-financial-change-facts-reader.contract';
import { OrderFinancialChangeFactsReaderService } from './order-financial-change-facts-reader.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderFinancialChangeFactsReaderService,
    {
      provide: ORDER_FINANCIAL_CHANGE_FACTS_READER,
      useExisting: OrderFinancialChangeFactsReaderService,
    },
  ],
  exports: [ORDER_FINANCIAL_CHANGE_FACTS_READER],
})
export class OrderFinancialChangeFactsModule {}
