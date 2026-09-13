import { Module } from '@nestjs/common';

import { PAYMENT_FINANCIAL_FACTS_READER } from './application/payment-financial-facts-reader.contract';
import { PAYMENT_TRANSACTION_REPOSITORY } from './application/payment-transaction.repository';
import { PaymentsModule } from './payments.module';

@Module({
  imports: [PaymentsModule],
  providers: [
    {
      provide: PAYMENT_FINANCIAL_FACTS_READER,
      useExisting: PAYMENT_TRANSACTION_REPOSITORY,
    },
  ],
  exports: [PAYMENT_FINANCIAL_FACTS_READER],
})
export class PaymentFinancialFactsModule {}
