import { Module } from '@nestjs/common';

import { ORDER_EXTERNAL_FACTS_READER } from './order-external-facts-reader.contract';
import { OrderExternalFactsReaderService } from './order-external-facts-reader.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderExternalFactsReaderService,
    {
      provide: ORDER_EXTERNAL_FACTS_READER,
      useExisting: OrderExternalFactsReaderService,
    },
  ],
  exports: [ORDER_EXTERNAL_FACTS_READER],
})
export class OrderExternalFactsModule {}
