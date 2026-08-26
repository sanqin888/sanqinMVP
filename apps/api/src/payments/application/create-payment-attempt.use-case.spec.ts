import { PaymentTransaction } from '../domain/payment-transaction';
import type { PaymentStatus } from '../domain/payment.types';
import {
  CreatePaymentAttemptUseCase,
  PaymentAttemptConflictError,
  TerminalPaymentService,
  type CreatePaymentAttemptInput,
} from './create-payment-attempt.use-case';
import type {
  PaymentProvider,
  PaymentTerminalProvider,
} from './payment-provider.port';
import {
  PaymentTransactionUniquenessError,
  type PaymentTransactionRepository,
} from './payment-transaction.repository';

class InMemoryPaymentTransactionRepository
  implements PaymentTransactionRepository
{
  readonly rows: PaymentTransaction[] = [];

  findById(id: string): Promise<PaymentTransaction | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  findByAttemptId(attemptId: string): Promise<PaymentTransaction | null> {
    return Promise.resolve(
      this.rows.find((row) => row.attemptId === attemptId) ?? null,
    );
  }

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentTransaction | null> {
    return Promise.resolve(
      this.rows.find((row) => row.idempotencyKey === idempotencyKey) ?? null,
    );
  }

  create(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    if (this.rows.some((row) => row.attemptId === transaction.attemptId)) {
      return Promise.reject(new PaymentTransactionUniquenessError('attemptId'));
    }
    if (
      this.rows.some((row) => row.idempotencyKey === transaction.idempotencyKey)
    ) {
      return Promise.reject(
        new PaymentTransactionUniquenessError('idempotencyKey'),
      );
    }
    const externalPaymentId = transaction.toSnapshot().externalPaymentId;
    if (
      externalPaymentId &&
      this.rows.some(
        (row) => row.toSnapshot().externalPaymentId === externalPaymentId,
      )
    ) {
      return Promise.reject(
        new PaymentTransactionUniquenessError('externalPaymentId'),
      );
    }
    this.rows.push(transaction);
    return Promise.resolve(transaction);
  }

  save(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const index = this.rows.findIndex((row) => row.id === transaction.id);
    if (index >= 0) this.rows[index] = transaction;
    else this.rows.push(transaction);
    return Promise.resolve(transaction);
  }

  saveIfCurrentStatus(
    transaction: PaymentTransaction,
    expectedStatus: PaymentStatus,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const index = this.rows.findIndex((row) => row.id === transaction.id);
    if (index < 0) {
      return Promise.reject(
        new Error(`Payment transaction not found: ${transaction.id}`),
      );
    }
    if (this.rows[index].status !== expectedStatus) {
      return Promise.resolve({ updated: false, transaction: this.rows[index] });
    }
    this.rows[index] = transaction;
    return Promise.resolve({ updated: true, transaction });
  }
}

const baseInput: CreatePaymentAttemptInput = {
  attemptId: 'pos-order-draft-1-attempt-1',
  idempotencyKey: 'pos-order-draft-1-attempt-1-sale',
  provider: 'CLOVER',
  source: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  operation: 'SALE',
  amountCents: 1899,
  currency: 'CAD',
};

describe('CreatePaymentAttemptUseCase', () => {
  it('creates exactly one logical payment attempt', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);

    const created = await useCase.execute(baseInput);

    expect(created.status).toBe('CREATED');
    expect(repository.rows).toHaveLength(1);
  });

  it('returns the existing attempt when an identical request is retried', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);

    const first = await useCase.execute(baseInput);
    const retried = await useCase.execute(baseInput);

    expect(retried.id).toBe(first.id);
    expect(repository.rows).toHaveLength(1);
  });

  it('still recognizes the attempt after provider facts are added', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);
    const first = await useCase.execute(baseInput);
    await repository.save(
      first.transitionTo('PROCESSING').applyProviderOutcome({
        status: 'SUCCEEDED',
        externalPaymentId: 'external-1',
        providerPaymentId: 'provider-payment-1',
      }),
    );

    const retried = await useCase.execute(baseInput);

    expect(retried.id).toBe(first.id);
    expect(retried.status).toBe('SUCCEEDED');
    expect(repository.rows).toHaveLength(1);
  });

  it('rejects reusing an attempt id with different payment facts', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);
    await useCase.execute(baseInput);

    await expect(
      useCase.execute({ ...baseInput, amountCents: 1999 }),
    ).rejects.toBeInstanceOf(PaymentAttemptConflictError);
    expect(repository.rows).toHaveLength(1);
  });

  it('treats the external payment id as an immutable attempt fact', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);
    await useCase.execute({ ...baseInput, externalPaymentId: 'external-1' });

    await expect(
      useCase.execute({ ...baseInput, externalPaymentId: 'external-2' }),
    ).rejects.toBeInstanceOf(PaymentAttemptConflictError);
    expect(repository.rows).toHaveLength(1);
  });

  it('rejects reusing an idempotency key for a different logical attempt', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const useCase = new CreatePaymentAttemptUseCase(repository);
    await useCase.execute(baseInput);

    await expect(
      useCase.execute({ ...baseInput, attemptId: 'different-attempt' }),
    ).rejects.toBeInstanceOf(PaymentAttemptConflictError);
    expect(repository.rows).toHaveLength(1);
  });

  it('enforces both attempt and idempotency uniqueness at the repository boundary', async () => {
    const repository = new InMemoryPaymentTransactionRepository();
    const first = PaymentTransaction.create({
      ...baseInput,
      id: '7ba31c69-9d10-469b-a2bf-508f1986c2bf',
    });
    await repository.create(first);

    await expect(
      repository.create(
        PaymentTransaction.create({
          ...baseInput,
          id: 'b0dd5d50-04fc-4d82-a36d-4e4e56e06c64',
          idempotencyKey: 'different-key',
        }),
      ),
    ).rejects.toEqual(new PaymentTransactionUniquenessError('attemptId'));

    await expect(
      repository.create(
        PaymentTransaction.create({
          ...baseInput,
          id: 'bf93e401-d58e-45e5-9a29-a41a2a033928',
          attemptId: 'different-attempt',
        }),
      ),
    ).rejects.toEqual(new PaymentTransactionUniquenessError('idempotencyKey'));
  });
});

const terminalInput = {
  attemptId: 'pos-draft-42-attempt-1',
  idempotencyKey: 'pos-draft-42-attempt-1-sale',
  amountCents: 2599,
  currency: 'CAD',
};

const createTerminalHarness = () => {
  const transactions = new InMemoryPaymentTransactionRepository();
  const createAttempt = new CreatePaymentAttemptUseCase(transactions);
  const provider: jest.Mocked<PaymentProvider> = {
    startPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    cancelPayment: jest.fn(),
    voidPayment: jest.fn(),
    refundPayment: jest.fn(),
  };
  const terminalProvider: jest.Mocked<PaymentTerminalProvider> = {
    getAvailability: jest.fn(),
  };
  const service = new TerminalPaymentService(
    createAttempt,
    transactions,
    provider,
    terminalProvider,
  );
  return { transactions, provider, terminalProvider, service };
};

describe('TerminalPaymentService', () => {
  it('persists a stable external id before Clover and saves final success', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockImplementation((request) => {
      expect(request.externalPaymentId).toHaveLength(32);
      return Promise.resolve({
        status: 'SUCCEEDED',
        externalPaymentId: request.externalPaymentId,
        providerPaymentId: 'clover-payment-1',
        providerOrderId: 'clover-order-1',
        terminalId: 'device-1',
        cardBrand: 'VISA',
        cardLast4: '4242',
        chargedTotalCents: 2661,
        surchargeCents: 62,
        resultCode: 'SUCCESS',
      });
    });

    const payment = await service.startSale(terminalInput);
    const snapshot = payment.toSnapshot();

    expect(snapshot.status).toBe('SUCCEEDED');
    expect(snapshot.providerPaymentId).toBe('clover-payment-1');
    expect(snapshot.externalPaymentId).toHaveLength(32);
    expect(snapshot.chargedTotalCents).toBe(2661);
    expect(snapshot.surchargeCents).toBe(62);
  });

  it('does not send a second sale for the same logical attempt', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockResolvedValue({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
    });

    const first = await service.startSale(terminalInput);
    const second = await service.startSale(terminalInput);

    expect(second.id).toBe(first.id);
    expect(provider.startPayment).toHaveBeenCalledTimes(1);
  });

  it('allows only one provider call when duplicate starts race', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockResolvedValue({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
    });

    await Promise.all([
      service.startSale(terminalInput),
      service.startSale(terminalInput),
    ]);

    expect(provider.startPayment).toHaveBeenCalledTimes(1);
  });

  it('persists timeout uncertainty and reconciles without re-charging', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'NETWORK_TIMEOUT',
      failureMessage: 'response lost',
    });

    const uncertainPayment = await service.startSale(terminalInput);
    expect(uncertainPayment.status).toBe('UNKNOWN');

    provider.getPaymentStatus.mockImplementation((request) =>
      Promise.resolve({
        status: 'SUCCEEDED',
        externalPaymentId: request.externalPaymentId,
        providerPaymentId: 'clover-payment-after-reconcile',
        chargedTotalCents: 2599,
        resultCode: 'SUCCESS',
        failureCode: null,
        failureMessage: null,
      }),
    );

    const resolved = await service.reconcile(uncertainPayment.id);

    expect(resolved.status).toBe('SUCCEEDED');
    expect(resolved.toSnapshot().providerPaymentId).toBe(
      'clover-payment-after-reconcile',
    );
    expect(provider.startPayment).toHaveBeenCalledTimes(1);
    expect(provider.getPaymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        externalPaymentId: uncertainPayment.toSnapshot().externalPaymentId,
        amountCents: 2599,
        currency: 'CAD',
      }),
    );
  });

  it('recovers a PROCESSING payment after a simulated API restart', async () => {
    const { transactions } = createTerminalHarness();
    const persisted = PaymentTransaction.create({
      id: '7ba31c69-9d10-469b-a2bf-508f1986c2bf',
      attemptId: 'restart-attempt',
      idempotencyKey: 'restart-attempt-sale',
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: 1599,
      currency: 'CAD',
      externalPaymentId: 'restart-external-id',
    }).transitionTo('PROCESSING');
    transactions.rows.push(persisted);

    const provider: jest.Mocked<PaymentProvider> = {
      startPayment: jest.fn(),
      getPaymentStatus: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED',
        externalPaymentId: 'restart-external-id',
        providerPaymentId: 'clover-recovered',
        chargedTotalCents: 1599,
        resultCode: 'SUCCESS',
      }),
      cancelPayment: jest.fn(),
      voidPayment: jest.fn(),
      refundPayment: jest.fn(),
    };
    const terminalProvider: jest.Mocked<PaymentTerminalProvider> = {
      getAvailability: jest.fn(),
    };
    const restartedService = new TerminalPaymentService(
      new CreatePaymentAttemptUseCase(transactions),
      transactions,
      provider,
      terminalProvider,
    );

    const recovered = await restartedService.reconcile(persisted.id);

    expect(recovered.status).toBe('SUCCEEDED');
    expect(recovered.toSnapshot().providerPaymentId).toBe('clover-recovered');
    expect(provider.startPayment).not.toHaveBeenCalled();
  });

  it('forces a PROCESSING cancel through UNKNOWN and reconciliation', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const processing = PaymentTransaction.create({
      id: 'e28e67cc-0992-46b1-a240-286a195968f1',
      attemptId: 'cancel-attempt',
      idempotencyKey: 'cancel-attempt-sale',
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: 1200,
      currency: 'CAD',
      externalPaymentId: 'cancel-external-id',
    }).transitionTo('PROCESSING');
    transactions.rows.push(processing);
    provider.cancelPayment.mockResolvedValue({
      status: 'CANCELLED',
      resultCode: 'CLOVER_CANCELLED',
    });

    const cancelled = await service.cancel(processing.id);

    expect(cancelled.status).toBe('UNKNOWN');
    expect(cancelled.toSnapshot().failureCode).toBe(
      'TERMINAL_CANCEL_REQUIRES_RECONCILIATION',
    );
  });

  it('reports terminal availability through the provider boundary', async () => {
    const { service, terminalProvider } = createTerminalHarness();
    terminalProvider.getAvailability.mockResolvedValue({
      state: 'AVAILABLE',
      configured: true,
      available: true,
      terminalId: 'device-1',
    });

    await expect(service.getAvailability()).resolves.toEqual({
      state: 'AVAILABLE',
      configured: true,
      available: true,
      terminalId: 'device-1',
    });
  });
});
