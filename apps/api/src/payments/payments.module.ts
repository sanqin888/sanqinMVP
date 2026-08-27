import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import {
  CreatePaymentAttemptUseCase,
  TerminalPaymentService,
} from './application/create-payment-attempt.use-case';
import { RefundPaymentService } from './application/refund-payment.service';
import {
  PAYMENT_PROVIDER_TRANSACTION_LOOKUP,
  type PaymentProviderTransactionLookup,
} from './application/payment-provider-transaction-lookup.port';
import {
  PAYMENT_REVERSE_SYNC_PERSISTENCE,
  type PaymentReverseSyncPersistence,
} from './application/payment-reverse-sync-persistence.port';
import { PaymentReverseSyncService } from './application/payment-reverse-sync.service';
import {
  PAYMENT_WEBHOOK_EVENT_REPOSITORY,
  type PaymentWebhookEventRepository,
} from './application/payment-webhook-event.repository';
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
import { PrismaPaymentWebhookEventRepository } from './infrastructure/prisma/prisma-payment-webhook-event.repository';

@Module({
  imports: [PrismaModule, CloverProviderInfrastructureModule],
  providers: [
    PrismaPaymentTransactionRepository,
    PrismaPaymentWebhookEventRepository,
    {
      provide: PAYMENT_TRANSACTION_REPOSITORY,
      useExisting: PrismaPaymentTransactionRepository,
    },
    {
      provide: PAYMENT_PROVIDER_TRANSACTION_LOOKUP,
      useFactory: (
        lookup: PrismaPaymentTransactionRepository,
      ): PaymentProviderTransactionLookup => lookup,
      inject: [PrismaPaymentTransactionRepository],
    },
    {
      provide: PAYMENT_WEBHOOK_EVENT_REPOSITORY,
      useFactory: (
        repository: PrismaPaymentWebhookEventRepository,
      ): PaymentWebhookEventRepository => repository,
      inject: [PrismaPaymentWebhookEventRepository],
    },
    {
      provide: PAYMENT_REVERSE_SYNC_PERSISTENCE,
      useFactory: (
        persistence: PrismaPaymentTransactionRepository,
      ): PaymentReverseSyncPersistence => persistence,
      inject: [PrismaPaymentTransactionRepository],
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
    {
      provide: PaymentReverseSyncService,
      useFactory: (
        lookup: PaymentProviderTransactionLookup,
        transactions: PaymentTransactionRepository,
        persistence: PaymentReverseSyncPersistence,
        provider: PaymentProvider,
        terminalPayments: TerminalPaymentService,
      ) =>
        new PaymentReverseSyncService(
          lookup,
          transactions,
          persistence,
          provider,
          terminalPayments,
        ),
      inject: [
        PAYMENT_PROVIDER_TRANSACTION_LOOKUP,
        PAYMENT_TRANSACTION_REPOSITORY,
        PAYMENT_REVERSE_SYNC_PERSISTENCE,
        PAYMENT_PROVIDER,
        TerminalPaymentService,
      ],
    },
    {
      provide: RefundPaymentService,
      useFactory: (
        createAttempt: CreatePaymentAttemptUseCase,
        transactions: PaymentTransactionRepository,
        provider: PaymentProvider,
      ) => new RefundPaymentService(createAttempt, transactions, provider),
      inject: [
        CreatePaymentAttemptUseCase,
        PAYMENT_TRANSACTION_REPOSITORY,
        PAYMENT_PROVIDER,
      ],
    },
  ],
  exports: [
    CloverProviderInfrastructureModule,
    PAYMENT_TRANSACTION_REPOSITORY,
    PAYMENT_PROVIDER,
    PAYMENT_WEBHOOK_EVENT_REPOSITORY,
    CreatePaymentAttemptUseCase,
    TerminalPaymentService,
    RefundPaymentService,
    PaymentReverseSyncService,
  ],
})
export class PaymentsModule {}
