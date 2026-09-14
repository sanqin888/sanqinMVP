import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PAYMENT_FINANCIAL_FACTS_READER } from './application/payment-financial-facts-reader.contract';
import { PAYMENT_REVERSAL_FINANCIAL_FACTS_READER } from './application/payment-reversal-financial-facts-reader.contract';
import { PrismaPaymentTransactionRepository } from './infrastructure/prisma/prisma-payment-transaction.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaPaymentTransactionRepository,
    {
      provide: PAYMENT_FINANCIAL_FACTS_READER,
      useExisting: PrismaPaymentTransactionRepository,
    },
    {
      provide: PAYMENT_REVERSAL_FINANCIAL_FACTS_READER,
      useExisting: PrismaPaymentTransactionRepository,
    },
  ],
  exports: [
    PAYMENT_FINANCIAL_FACTS_READER,
    PAYMENT_REVERSAL_FINANCIAL_FACTS_READER,
  ],
})
export class PaymentFinancialFactsModule {}
