import { Module } from '@nestjs/common';

import { ORDER_SALES_ATTRIBUTION_READER } from './order-sales-attribution.contract';
import { OrderSalesAttributionReaderService } from './order-sales-attribution.service';
import { PrismaModule } from './orders-prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    OrderSalesAttributionReaderService,
    {
      provide: ORDER_SALES_ATTRIBUTION_READER,
      useExisting: OrderSalesAttributionReaderService,
    },
  ],
  exports: [ORDER_SALES_ATTRIBUTION_READER],
})
export class OrderSalesAttributionModule {}
