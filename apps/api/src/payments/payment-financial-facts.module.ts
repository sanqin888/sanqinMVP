import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PAYMENT_FINANCIAL_FACTS_READER } from './application/payment-financial-facts-reader.contract';
import { PrismaPaymentFinancialFactsReader } from './infrastructure/prisma/prisma-payment-financial-facts.reader';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaPaymentFinancialFactsReader,
    {
      provide: PAYMENT_FINANCIAL_FACTS_READER,
      useExisting: PrismaPaymentFinancialFactsReader,
    },
  ],
  exports: [PAYMENT_FINANCIAL_FACTS_READER],
})
export class PaymentFinancialFactsModule {}
