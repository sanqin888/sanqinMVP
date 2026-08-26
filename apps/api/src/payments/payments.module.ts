import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import {
  CreatePaymentAttemptUseCase,
  TerminalPaymentService,
} from './application/create-payment-attempt.use-case';
import {
  PAYMENT_PROVIDER,
  PAYMENT_TERMINAL_PROVIDER,
  type PaymentProvider,
  type PaymentTerminalProvider,
} from './application/payment-provider.port';
import {
  PAYMENT_TRANSACTION_REPOSITORY,
  type PaymentTransactionRepository,
} from './application/payment-transaction.repository';
import { CloverPaymentProviderAdapter } from './infrastructure/clover/clover-payment-provider.adapter';
import { CloverProviderInfrastructureModule } from './infrastructure/clover/clover-provider-infrastructure.module';
import { PrismaPaymentTransactionRepository } from './infrastructure/prisma/prisma-payment-transaction.repository';

@Module({
  imports: [PrismaModule, CloverProviderInfrastructureModule],
  providers: [
    PrismaPaymentTransactionRepository,
    {
      provide: PAYMENT_TRANSACTION_REPOSITORY,
      useExisting: PrismaPaymentTransactionRepository,
    },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (provider: CloverPaymentProviderAdapter): PaymentProvider =>
        provider,
      inject: [CloverPaymentProviderAdapter],
    },
    {
      provide: PAYMENT_TERMINAL_PROVIDER,
      useFactory: (
        provider: CloverPaymentProviderAdapter,
      ): PaymentTerminalProvider => provider,
      inject: [CloverPaymentProviderAdapter],
    },
    {
      provide: CreatePaymentAttemptUseCase,
      useFactory: (transactions: PaymentTransactionRepository) =>
        new CreatePaymentAttemptUseCase(transactions),
      inject: [PAYMENT_TRANSACTION_REPOSITORY],
    },
    {
      provide: TerminalPaymentService,
      useFactory: (
        createAttempt: CreatePaymentAttemptUseCase,
        transactions: PaymentTransactionRepository,
        provider: PaymentProvider,
        terminalProvider: PaymentTerminalProvider,
      ) =>
        new TerminalPaymentService(
          createAttempt,
          transactions,
          provider,
          terminalProvider,
        ),
      inject: [
        CreatePaymentAttemptUseCase,
        PAYMENT_TRANSACTION_REPOSITORY,
        PAYMENT_PROVIDER,
        PAYMENT_TERMINAL_PROVIDER,
      ],
    },
  ],
  exports: [
    PAYMENT_TRANSACTION_REPOSITORY,
    PAYMENT_PROVIDER,
    CreatePaymentAttemptUseCase,
    TerminalPaymentService,
  ],
})
export class PaymentsModule {}
