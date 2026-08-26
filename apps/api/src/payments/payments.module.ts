import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CreatePaymentAttemptUseCase } from './application/create-payment-attempt.use-case';
import {
  PAYMENT_TRANSACTION_REPOSITORY,
  type PaymentTransactionRepository,
} from './application/payment-transaction.repository';
import { PrismaPaymentTransactionRepository } from './infrastructure/prisma/prisma-payment-transaction.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaPaymentTransactionRepository,
    {
      provide: PAYMENT_TRANSACTION_REPOSITORY,
      useExisting: PrismaPaymentTransactionRepository,
    },
    {
      provide: CreatePaymentAttemptUseCase,
      useFactory: (transactions: PaymentTransactionRepository) =>
        new CreatePaymentAttemptUseCase(transactions),
      inject: [PAYMENT_TRANSACTION_REPOSITORY],
    },
  ],
  exports: [PAYMENT_TRANSACTION_REPOSITORY, CreatePaymentAttemptUseCase],
})
export class PaymentsModule {}
