import { PaymentTransaction } from '../domain/payment-transaction';
import type {
  PaymentProviderOutcome,
  PaymentStatus,
} from '../domain/payment.types';
import {
  CreatePaymentAttemptUseCase,
  PaymentAttemptConflictError,
  PaymentFinalStateConflictError,
  TerminalPaymentService,
  type CreatePaymentAttemptInput,
} from './create-payment-attempt.use-case';
import type {
  PaymentProvider,
  PaymentTerminalProvider,
  StartPaymentRequest,
} from './payment-provider.port';
import type { PaymentTerminalOperationRepository } from './payment-terminal-operation.repository';
import {
  PaymentTransactionUniquenessError,
  type PaymentTransactionRepository,
} from './payment-transaction.repository';

class InMemoryPaymentTransactionRepository implements PaymentTransactionRepository {
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

  claimUncertainResultCode(
    paymentId: string,
    expectedResultCode: string,
    claimedResultCode: string,
    expectedFailureCode: string,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const index = this.rows.findIndex((row) => row.id === paymentId);
    if (index < 0) return Promise.reject(new Error('Payment not found'));
    const current = this.rows[index];
    const snapshot = current.toSnapshot();
    if (
      !['UNKNOWN', 'RECONCILING'].includes(snapshot.status) ||
      snapshot.source !== 'POS_TERMINAL' ||
      snapshot.operation !== 'SALE' ||
      snapshot.resultCode !== expectedResultCode ||
      snapshot.failureCode !== expectedFailureCode ||
      snapshot.providerPaymentId !== null
    ) {
      return Promise.resolve({ updated: false, transaction: current });
    }
    const claimed = current.recordProviderObservation({
      status: snapshot.status,
      resultCode: claimedResultCode,
    });
    this.rows[index] = claimed;
    return Promise.resolve({ updated: true, transaction: claimed });
  }

  saveIfCurrentStatus(
    transaction: PaymentTransaction,
    expectedStatus: PaymentStatus,
    expectedObservation?: Pick<
      ReturnType<PaymentTransaction['toSnapshot']>,
      'updatedAt' | 'resultCode' | 'failureCode'
    >,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const index = this.rows.findIndex((row) => row.id === transaction.id);
    if (index < 0) {
      return Promise.reject(
        new Error(`Payment transaction not found: ${transaction.id}`),
      );
    }
    const current = this.rows[index].toSnapshot();
    if (
      current.status !== expectedStatus ||
      (expectedObservation !== undefined &&
        (current.updatedAt.getTime() !==
          expectedObservation.updatedAt.getTime() ||
          current.resultCode !== expectedObservation.resultCode ||
          current.failureCode !== expectedObservation.failureCode))
    ) {
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

const canonicalOutcome = (
  request: Pick<
    StartPaymentRequest,
    'paymentId' | 'attemptId' | 'idempotencyKey' | 'externalPaymentId'
  > & { amountCents?: number; currency?: string },
  status: 'SUCCEEDED' | 'DECLINED' | 'CANCELLED' | 'FAILED' = 'SUCCEEDED',
  overrides: Partial<PaymentProviderOutcome> = {},
): PaymentProviderOutcome => {
  if (request.amountCents === undefined || request.currency === undefined) {
    throw new Error('canonical test outcome requires amount and currency');
  }
  return {
    status,
    evidence: 'CANONICAL',
    paymentId: request.paymentId,
    attemptId: request.attemptId,
    idempotencyKey: request.idempotencyKey,
    externalPaymentId: request.externalPaymentId,
    providerPaymentId: 'clover-payment-1',
    amountCents: request.amountCents,
    currency: request.currency,
    tipCents: 0,
    surchargeCents: status === 'SUCCEEDED' ? 62 : 0,
    chargedTotalCents:
      status === 'SUCCEEDED' ? request.amountCents + 62 : request.amountCents,
    resultCode: status === 'SUCCEEDED' ? 'success' : status.toLowerCase(),
    failureCode: status === 'SUCCEEDED' ? null : `CLOVER_${status}`,
    failureMessage: status === 'SUCCEEDED' ? null : `Clover ${status}`,
    ...overrides,
  };
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createTerminalHarness = (
  operations?: PaymentTerminalOperationRepository,
) => {
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
    getAvailability: jest.fn().mockResolvedValue({
      state: 'AVAILABLE',
      configured: true,
      available: true,
    }),
    prepareOriginalSaleResume: jest.fn().mockResolvedValue(true),
    clearTimedOutSaleDisplay: jest.fn().mockResolvedValue(true),
    completeCustomerInteraction: jest.fn().mockResolvedValue(false),
    cancelCustomerConfirmation: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TerminalPaymentService(
    createAttempt,
    transactions,
    provider,
    terminalProvider,
    operations,
  );
  return { transactions, provider, terminalProvider, service };
};

describe('TerminalPaymentService', () => {
  const terminal504Unknown = (): PaymentProviderOutcome => ({
    status: 'UNKNOWN',
    evidence: 'CANONICAL',
    resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
    failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    failureMessage: 'Clover Platform has not exposed the payment yet',
  });

  it('preserves 504 evidence and HOLD after bounded display cleanup and canonical NOT_FOUND', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const result = await service.startSale(terminalInput);
    expect(result.status).toBe('RECONCILING');
    expect(result.toSnapshot()).toMatchObject({
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      providerPaymentId: null,
    });
    expect(terminalProvider.clearTimedOutSaleDisplay.mock.calls).toHaveLength(
      1,
    );
    expect(provider.getPaymentStatus.mock.calls).toHaveLength(1);
    expect(provider.startPayment.mock.calls).toHaveLength(1);
  });

  it('keeps the original 504 result even if device cleanup fails', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    terminalProvider.clearTimedOutSaleDisplay.mockRejectedValueOnce(
      new Error('device unavailable'),
    );
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const result = await service.startSale(terminalInput);
    expect(result.status).toBe('RECONCILING');
    expect(result.toSnapshot().resultCode).toBe(
      'CLOVER_TERMINAL_SALE_HTTP_504',
    );
    expect(provider.startPayment.mock.calls).toHaveLength(1);
  });

  it('rechecks the original 504 and replays at most once using identical payment identity', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const initial = await service.startSale(terminalInput);
    expect(initial.status).toBe('RECONCILING');
    expect(terminalProvider.clearTimedOutSaleDisplay.mock.calls[0]).toEqual([
      initial.toSnapshot().externalPaymentId,
    ]);

    provider.startPayment.mockImplementation((request) =>
      Promise.resolve(canonicalOutcome(request)),
    );
    const resumed = await service.resumeOriginal504Sale(initial.id);
    expect(resumed.status).toBe('SUCCEEDED');
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      1,
    );
    expect(provider.startPayment.mock.calls).toHaveLength(2);
    expect(provider.startPayment.mock.calls[1]?.[0]).toMatchObject({
      paymentId: initial.id,
      attemptId: terminalInput.attemptId,
      idempotencyKey: terminalInput.idempotencyKey,
      externalPaymentId: initial.toSnapshot().externalPaymentId,
      amountCents: terminalInput.amountCents,
      currency: 'CAD',
    });

    expect((await service.resumeOriginal504Sale(initial.id)).status).toBe(
      'SUCCEEDED',
    );
    expect(provider.startPayment.mock.calls).toHaveLength(2);
  });

  it('canonical success found after 504 finalizes without replay or device reset', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    const initial = await service.startSale(terminalInput);
    provider.getPaymentStatus.mockImplementation((request) =>
      Promise.resolve(
        canonicalOutcome({
          ...request,
          amountCents: terminalInput.amountCents,
          currency: terminalInput.currency,
        }),
      ),
    );
    const result = await service.resumeOriginal504Sale(initial.id);
    expect(result.status).toBe('SUCCEEDED');
    expect(provider.startPayment.mock.calls).toHaveLength(1);
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      0,
    );
  });

  it('preserves UNKNOWN/HOLD with no new Sale if device is busy', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const initial = await service.startSale(terminalInput);
    terminalProvider.getAvailability.mockResolvedValue({
      state: 'BUSY',
      configured: true,
      available: false,
    });
    await expect(service.resumeOriginal504Sale(initial.id)).rejects.toThrow(
      'device is not idle',
    );
    expect(provider.startPayment.mock.calls).toHaveLength(1);
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      0,
    );
    expect((await service.findById(initial.id)).status).toBe('RECONCILING');
  });

  it('holds the original payment if Welcome is not confirmed after the claim', async () => {
    const { service, provider, terminalProvider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const original = await service.startSale(terminalInput);
    terminalProvider.prepareOriginalSaleResume.mockResolvedValue(false);

    const held = await service.resumeOriginal504Sale(original.id);
    expect(held.status).toBe('RECONCILING');
    expect(service.canResumeOriginal504Sale(held)).toBe(false);
    expect(provider.startPayment.mock.calls).toHaveLength(1);
    await service.resumeOriginal504Sale(original.id);
    expect(provider.startPayment.mock.calls).toHaveLength(1);
  });

  it('one-time claim prevents duplicate provider calls across simultaneous operator clicks', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockResolvedValueOnce(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const original = await service.startSale(terminalInput);
    const held = deferred<PaymentProviderOutcome>();
    provider.startPayment.mockReturnValue(held.promise);
    const first = service.resumeOriginal504Sale(original.id);
    const second = service.resumeOriginal504Sale(original.id);
    // Both may read the original state, but only one CAS claim may win.
    await new Promise<void>((resolve) => setImmediate(resolve));
    held.resolve({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    await Promise.all([first, second]);
    expect(provider.startPayment.mock.calls).toHaveLength(2);
  });

  it('does not re-arm retry after another 504 from the identical Sale', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockResolvedValue(terminal504Unknown());
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const initial = await service.startSale(terminalInput);
    const next = await service.resumeOriginal504Sale(initial.id);
    expect(next.status).toBe('RECONCILING');
    expect(next.toSnapshot().resultCode).toBe(
      'CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED',
    );
    await service.resumeOriginal504Sale(initial.id);
    expect(provider.startPayment.mock.calls).toHaveLength(2);
  });

  it('keeps UI cleanup best-effort and never propagates device errors', async () => {
    const { service, terminalProvider } = createTerminalHarness();
    terminalProvider.completeCustomerInteraction.mockRejectedValue(
      new Error('terminal is offline'),
    );

    await expect(
      service.completeCustomerInteraction('SUCCEEDED'),
    ).resolves.toBe(false);
    expect(terminalProvider.completeCustomerInteraction.mock.calls[0]).toEqual([
      'SUCCEEDED',
      undefined,
      true,
    ]);
  });

  it('persists a stable external id before Clover and saves final success', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockImplementation((request) => {
      expect(request.externalPaymentId).toHaveLength(32);
      return Promise.resolve(
        canonicalOutcome(request, 'SUCCEEDED', {
          providerOrderId: 'clover-order-1',
          terminalId: 'device-1',
          cardBrand: 'VISA',
          cardLast4: '4242',
          chargedTotalCents: 2661,
          surchargeCents: 62,
        }),
      );
    });

    const payment = await service.startSale(terminalInput);
    const snapshot = payment.toSnapshot();

    expect(snapshot.status).toBe('SUCCEEDED');
    expect(snapshot.providerPaymentId).toBe('clover-payment-1');
    expect(snapshot.externalPaymentId).toHaveLength(32);
    expect(snapshot.chargedTotalCents).toBe(2661);
    expect(snapshot.tipCents).toBe(0);
    expect(snapshot.surchargeCents).toBe(62);
  });

  it.each([
    ['tip', { tipCents: undefined }, 'canonical provider tip amount missing'],
    [
      'surcharge',
      { surchargeCents: undefined },
      'canonical provider surcharge amount missing',
    ],
    [
      'charged total',
      { chargedTotalCents: undefined },
      'canonical charged total missing',
    ],
  ] as const)(
    'fails closed instead of finalizing a Clover POS sale when canonical %s authority is missing',
    async (_label, overrides, expectedProblem) => {
      const { service, provider } = createTerminalHarness();
      provider.startPayment.mockImplementation((request) =>
        Promise.resolve(
          canonicalOutcome(request, 'SUCCEEDED', {
            ...overrides,
          }),
        ),
      );

      const payment = await service.startSale(terminalInput);
      const snapshot = payment.toSnapshot();

      expect(snapshot.status).toBe('UNKNOWN');
      expect(snapshot.failureCode).toBe(
        'PAYMENT_PROVIDER_CORRELATION_MISMATCH',
      );
      expect(snapshot.failureMessage).toContain(expectedProblem);
    },
  );

  it('does not send a second sale for the same logical attempt', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockImplementation((request) =>
      Promise.resolve(canonicalOutcome(request)),
    );

    const first = await service.startSale(terminalInput);
    const second = await service.startSale(terminalInput);

    expect(second.id).toBe(first.id);
    expect(provider.startPayment.mock.calls).toHaveLength(1);
  });

  it('allows only one provider call when duplicate starts race', async () => {
    const { service, provider } = createTerminalHarness();
    provider.startPayment.mockImplementation((request) =>
      Promise.resolve(canonicalOutcome(request)),
    );

    await Promise.all([
      service.startSale(terminalInput),
      service.startSale(terminalInput),
    ]);

    expect(provider.startPayment.mock.calls).toHaveLength(1);
  });

  it('merges a late canonical success after recovery moves PROCESSING through UNKNOWN to RECONCILING', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const late = deferred<PaymentProviderOutcome>();
    const started = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      started.resolve(request);
      return late.promise;
    });
    provider.getPaymentStatus.mockImplementation((request) =>
      Promise.resolve({
        status: 'UNKNOWN',
        evidence: 'CANONICAL',
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        externalPaymentId: request.externalPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
        failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
        failureMessage: 'not visible yet',
      }),
    );

    const originalRequest = service.startSale(terminalInput);
    const providerRequest = await started.promise;
    const processing = transactions.rows[0];
    expect(processing?.status).toBe('PROCESSING');

    const recoveryResult = await service.reconcile(processing.id);
    expect(recoveryResult.status).toBe('RECONCILING');

    late.resolve(canonicalOutcome(providerRequest));
    const resolved = await originalRequest;

    expect(resolved.status).toBe('SUCCEEDED');
    expect(transactions.rows[0]?.status).toBe('SUCCEEDED');
  });

  it('merges a late canonical success when recovery has only reached UNKNOWN', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const late = deferred<PaymentProviderOutcome>();
    const started = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      started.resolve(request);
      return late.promise;
    });

    const originalRequest = service.startSale(terminalInput);
    const providerRequest = await started.promise;
    const processing = transactions.rows[0];
    const moved = await transactions.saveIfCurrentStatus(
      processing.applyProviderOutcome({
        status: 'UNKNOWN',
        failureCode: 'SIMULATED_RECOVERY',
      }),
      'PROCESSING',
    );
    expect(moved.transaction.status).toBe('UNKNOWN');

    late.resolve(canonicalOutcome(providerRequest));
    const resolved = await originalRequest;

    expect(resolved.status).toBe('SUCCEEDED');
    expect(transactions.rows[0]?.status).toBe('SUCCEEDED');
  });

  it('allows RECONCILING to converge to canonical DECLINED', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const reconciling = PaymentTransaction.create({
      id: '44444444-4444-4444-8444-444444444444',
      attemptId: 'decline-attempt',
      idempotencyKey: 'decline-attempt-sale',
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: 1800,
      currency: 'CAD',
      externalPaymentId: 'decline-external',
    })
      .transitionTo('PROCESSING')
      .applyProviderOutcome({ status: 'UNKNOWN' })
      .transitionTo('RECONCILING');
    transactions.rows.push(reconciling);
    provider.getPaymentStatus.mockImplementation((request) =>
      Promise.resolve(
        canonicalOutcome(request, 'DECLINED', {
          providerPaymentId: 'clover-declined',
        }),
      ),
    );

    const resolved = await service.reconcile(reconciling.id);

    expect(resolved.status).toBe('DECLINED');
    expect(resolved.toSnapshot().providerPaymentId).toBe('clover-declined');
  });

  it('treats duplicate late canonical success as idempotent after another writer already finalized success', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const late = deferred<PaymentProviderOutcome>();
    const started = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      started.resolve(request);
      return late.promise;
    });

    const originalRequest = service.startSale(terminalInput);
    const providerRequest = await started.promise;
    const processing = transactions.rows[0];
    const winner = processing.applyProviderOutcome(
      canonicalOutcome(providerRequest),
    );
    await transactions.saveIfCurrentStatus(winner, 'PROCESSING');

    late.resolve(canonicalOutcome(providerRequest));
    const resolved = await originalRequest;

    expect(resolved.status).toBe('SUCCEEDED');
    expect(transactions.rows[0]?.status).toBe('SUCCEEDED');
  });

  it('preserves an existing final result and surfaces a conflicting late final result', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const late = deferred<PaymentProviderOutcome>();
    const started = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      started.resolve(request);
      return late.promise;
    });

    const originalRequest = service.startSale(terminalInput);
    const providerRequest = await started.promise;
    const processing = transactions.rows[0];
    const winner = processing.applyProviderOutcome(
      canonicalOutcome(providerRequest),
    );
    await transactions.saveIfCurrentStatus(winner, 'PROCESSING');

    late.resolve(canonicalOutcome(providerRequest, 'DECLINED'));
    await expect(originalRequest).rejects.toBeInstanceOf(
      PaymentFinalStateConflictError,
    );
    expect(transactions.rows[0]?.status).toBe('SUCCEEDED');
  });

  it('does not finalize a late canonical result with mismatched externalPaymentId', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const late = deferred<PaymentProviderOutcome>();
    const started = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      started.resolve(request);
      return late.promise;
    });

    const originalRequest = service.startSale(terminalInput);
    const providerRequest = await started.promise;
    const processing = transactions.rows[0];
    await transactions.saveIfCurrentStatus(
      processing.applyProviderOutcome({ status: 'UNKNOWN' }),
      'PROCESSING',
    );

    late.resolve(
      canonicalOutcome(providerRequest, 'SUCCEEDED', {
        externalPaymentId: 'different-external-id',
      }),
    );
    const resolved = await originalRequest;

    expect(resolved.status).toBe('UNKNOWN');
    expect(resolved.toSnapshot().failureCode).toBe(
      'PAYMENT_PROVIDER_CORRELATION_MISMATCH',
    );
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
      Promise.resolve(
        canonicalOutcome(request, 'SUCCEEDED', {
          providerPaymentId: 'clover-payment-after-reconcile',
          surchargeCents: 0,
          chargedTotalCents: 2599,
        }),
      ),
    );

    const resolved = await service.reconcile(uncertainPayment.id);

    expect(resolved.status).toBe('SUCCEEDED');
    expect(resolved.toSnapshot().providerPaymentId).toBe(
      'clover-payment-after-reconcile',
    );
    expect(provider.startPayment.mock.calls).toHaveLength(1);
    expect(provider.getPaymentStatus.mock.calls[0]?.[0]).toEqual(
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
      getPaymentStatus: jest
        .fn()
        .mockImplementation(
          (request: Parameters<PaymentProvider['getPaymentStatus']>[0]) =>
            Promise.resolve(
              canonicalOutcome(request, 'SUCCEEDED', {
                providerPaymentId: 'clover-recovered',
                surchargeCents: 0,
                chargedTotalCents: 1599,
              }),
            ),
        ),
      cancelPayment: jest.fn(),
      voidPayment: jest.fn(),
      refundPayment: jest.fn(),
    };
    const terminalProvider: jest.Mocked<PaymentTerminalProvider> = {
      getAvailability: jest.fn(),
      prepareOriginalSaleResume: jest.fn().mockResolvedValue(true),
      clearTimedOutSaleDisplay: jest.fn().mockResolvedValue(true),
      completeCustomerInteraction: jest.fn().mockResolvedValue(false),
      cancelCustomerConfirmation: jest.fn().mockResolvedValue(undefined),
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
    expect(provider.startPayment.mock.calls).toHaveLength(0);
  });

  it.each(['UNKNOWN', 'RECONCILING'] as const)(
    'accepts the original Sale HTTP 209 after POS Cancel entered %s',
    async (uncertainStatus) => {
      const { service, provider, transactions } = createTerminalHarness();
      const pendingSale = deferred<PaymentProviderOutcome>();
      const saleStarted = deferred<StartPaymentRequest>();
      provider.startPayment.mockImplementation((request) => {
        saleStarted.resolve(request);
        return pendingSale.promise;
      });
      provider.cancelPayment.mockResolvedValue({
        status: 'UNKNOWN',
        failureCode: 'CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED',
      });

      const sale = service.startSale(terminalInput);
      await saleStarted.promise;
      const cancelled = await service.cancel(transactions.rows[0].id);
      expect(cancelled.status).toBe('UNKNOWN');
      if (uncertainStatus === 'RECONCILING') {
        provider.getPaymentStatus.mockResolvedValue({
          status: 'UNKNOWN',
          failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
        });
        const recovering = await service.reconcile(cancelled.id);
        expect(recovering.status).toBe('RECONCILING');
      }

      pendingSale.resolve({
        status: 'CANCELLED',
        evidence: 'TERMINAL_SALE_CANCELLED',
        resultCode: 'CLOVER_CANCELLED',
      });
      const finalPayment = await sale;
      expect(finalPayment.status).toBe('CANCELLED');
      expect(transactions.rows[0].status).toBe('CANCELLED');
      expect(provider.startPayment.mock.calls).toHaveLength(1);
    },
  );

  it('keeps HOLD-protecting uncertainty for an unverified cancellation response', async () => {
    const { service, provider, transactions } = createTerminalHarness();
    const pendingSale = deferred<PaymentProviderOutcome>();
    const saleStarted = deferred<StartPaymentRequest>();
    provider.startPayment.mockImplementation((request) => {
      saleStarted.resolve(request);
      return pendingSale.promise;
    });
    provider.cancelPayment.mockResolvedValue({ status: 'UNKNOWN' });

    const sale = service.startSale(terminalInput);
    await saleStarted.promise;
    await service.cancel(transactions.rows[0].id);
    pendingSale.resolve({
      status: 'CANCELLED',
      evidence: 'EXECUTION',
      resultCode: 'CLOVER_CANCELLED',
    });
    const observed = await sale;
    expect(observed.status).toBe('UNKNOWN');
    expect(observed.toSnapshot().failureCode).toBe(
      'PAYMENT_PROVIDER_CORRELATION_MISMATCH',
    );
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

  const guardedOperations =
    (): jest.Mocked<PaymentTerminalOperationRepository> => ({
      reserve: jest.fn().mockResolvedValue(true),
      findByAttemptId: jest.fn().mockResolvedValue({
        terminalId: 'compact-1',
        storeStableId: '4750_Yonge_Street',
        attemptId: terminalInput.attemptId,
        paymentTransactionId: null,
        externalPaymentId: null,
        state: 'SALE_IN_FLIGHT',
        cancelRequestedAt: null,
      }),
      claimDispatch: jest.fn().mockResolvedValue(true),
      requestCancel: jest.fn().mockResolvedValue({
        operation: null,
        sendDeviceCancel: true,
        requested: true,
      }),
      acknowledgeCancel: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
    });

  it('fences the Compact and accepts original Sale 209 only after canonical NOT_FOUND', async () => {
    const operations = guardedOperations();
    const { service, provider, transactions } =
      createTerminalHarness(operations);
    const started = deferred<void>();
    const originalSale = deferred<PaymentProviderOutcome>();
    provider.startPayment.mockImplementation(() => {
      started.resolve(undefined);
      return originalSale.promise;
    });
    provider.cancelPayment.mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED',
    });
    provider.getPaymentStatus.mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    const pending = service.startSale(terminalInput);
    await started.promise;
    const ack = await service.cancel(
      transactions.rows[0].id,
      '4750_Yonge_Street',
    );
    expect(ack.status).toBe('UNKNOWN');
    expect(operations.requestCancel).toHaveBeenCalledWith(
      terminalInput.attemptId,
      '4750_Yonge_Street',
    );
    expect(operations.acknowledgeCancel).toHaveBeenCalledTimes(1);

    originalSale.resolve({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
      resultCode: 'CLOVER_CANCELLED',
    });
    expect((await pending).status).toBe('CANCELLED');
    expect(provider.startPayment).toHaveBeenCalledTimes(1);
    expect(provider.getPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it('prefers canonical success when original Sale 209 races a card tap', async () => {
    const operations = guardedOperations();
    const { service, provider } = createTerminalHarness(operations);
    provider.startPayment.mockResolvedValue({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
      resultCode: 'CLOVER_CANCELLED',
    });
    provider.getPaymentStatus.mockImplementation((request) =>
      Promise.resolve(canonicalOutcome(request, 'SUCCEEDED')),
    );
    const paid = await service.startSale(terminalInput);
    expect(paid.status).toBe('SUCCEEDED');
    expect(operations.complete).not.toHaveBeenCalled();
  });

  it('prevents a new Sale after a durable pre-dispatch cancellation', async () => {
    const operations = guardedOperations();
    operations.claimDispatch.mockResolvedValue(false);
    operations.findByAttemptId.mockResolvedValue({
      terminalId: 'compact-1',
      storeStableId: '4750_Yonge_Street',
      attemptId: terminalInput.attemptId,
      paymentTransactionId: null,
      externalPaymentId: null,
      state: 'CANCEL_REQUESTED',
      cancelRequestedAt: new Date(),
    });
    const { service, provider } = createTerminalHarness(operations);
    const result = await service.startSale(terminalInput);
    expect(result.status).toBe('CANCELLED');
    expect(provider.startPayment).not.toHaveBeenCalled();
    expect(operations.complete).not.toHaveBeenCalled();
    expect(
      await service.completeUndispatchedCancel(terminalInput.attemptId),
    ).toBe(true);
    expect(operations.complete).toHaveBeenCalledWith(terminalInput.attemptId);
  });

  it('blocks original 504 resume after this terminal owner recorded a Cancel intent', async () => {
    const operations = guardedOperations();
    const { service, provider, transactions } =
      createTerminalHarness(operations);
    const payment = PaymentTransaction.create({
      id: 'e28e67cc-0992-46b1-a240-286a195968f1',
      attemptId: terminalInput.attemptId,
      idempotencyKey: terminalInput.idempotencyKey,
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: terminalInput.amountCents,
      currency: 'CAD',
      externalPaymentId: 'external-resume-1',
    })
      .transitionTo('PROCESSING')
      .applyProviderOutcome({
        status: 'UNKNOWN',
        resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
        failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      });
    transactions.rows.push(payment);
    operations.findByAttemptId.mockResolvedValue({
      terminalId: 'compact-1',
      storeStableId: '4750_Yonge_Street',
      attemptId: terminalInput.attemptId,
      paymentTransactionId: payment.id,
      externalPaymentId: 'external-resume-1',
      state: 'CANCEL_ACKED',
      cancelRequestedAt: new Date(),
    });
    await expect(service.resumeOriginal504Sale(payment.id)).rejects.toThrow(
      'terminal ownership or cancellation',
    );
    expect(provider.startPayment).not.toHaveBeenCalled();
  });

  it('does not cancel another Store terminal operation', async () => {
    const operations = guardedOperations();
    operations.findByAttemptId.mockResolvedValue({
      terminalId: 'compact-1',
      storeStableId: 'another-store',
      attemptId: terminalInput.attemptId,
      paymentTransactionId: null,
      externalPaymentId: null,
      state: 'SALE_IN_FLIGHT',
      cancelRequestedAt: null,
    });
    const { service, provider, transactions } =
      createTerminalHarness(operations);
    const running = PaymentTransaction.create({
      id: 'e28e67cc-0992-46b1-a240-286a195968f1',
      attemptId: terminalInput.attemptId,
      idempotencyKey: terminalInput.idempotencyKey,
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: terminalInput.amountCents,
      currency: 'CAD',
      externalPaymentId: 'different-external',
    }).transitionTo('PROCESSING');
    transactions.rows.push(running);
    const result = await service.cancel(running.id, '4750_Yonge_Street');
    expect(result.status).toBe('PROCESSING');
    expect(provider.cancelPayment).not.toHaveBeenCalled();
  });
});
