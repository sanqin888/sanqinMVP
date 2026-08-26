import { PaymentTransaction } from '../domain/payment-transaction';
import {
  CreatePaymentAttemptUseCase,
  PaymentAttemptConflictError,
  type CreatePaymentAttemptInput,
} from './create-payment-attempt.use-case';
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
    this.rows.push(transaction);
    return Promise.resolve(transaction);
  }

  save(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const index = this.rows.findIndex((row) => row.id === transaction.id);
    if (index >= 0) this.rows[index] = transaction;
    else this.rows.push(transaction);
    return Promise.resolve(transaction);
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
