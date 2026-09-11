import { Module } from '@nestjs/common';

import { ORDER_REPORTING_FACTS_READER } from './order-reporting-facts-reader.contract';
import { OrderReportingFactsReaderService } from './order-reporting-facts-reader.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderReportingFactsReaderService,
    {
      provide: ORDER_REPORTING_FACTS_READER,
      useExisting: OrderReportingFactsReaderService,
    },
  ],
  exports: [ORDER_REPORTING_FACTS_READER],
})
export class OrderReportingFactsModule {}
