import { PaymentTransaction } from '../domain/payment-transaction';
import type { PaymentProviderOutcome, PaymentStatus } from '../domain/payment.types';
import { CreatePaymentAttemptUseCase } from './create-payment-attempt.use-case';
import type { PaymentProvider } from './payment-provider.port';
import {
  PaymentTransactionUniquenessError,
  type PaymentTransactionRepository,
} from './payment-transaction.repository';
import {
  PaymentReversalPreflightError,
  RefundPaymentService,
  type StartOrRecoverRefundInput,
} from './refund-payment.service';

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

  saveIfCurrentStatus(
    transaction: PaymentTransaction,
    expectedStatus: PaymentStatus,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const index = this.rows.findIndex((row) => row.id === transaction.id);
    if (index < 0) return Promise.reject(new Error('payment not found'));
    if (this.rows[index].status !== expectedStatus) {
      return Promise.resolve({ updated: false, transaction: this.rows[index] });
    }
    this.rows[index] = transaction;
    return Promise.resolve({ updated: true, transaction });
  }
}

const createSuccessfulSale = (): PaymentTransaction =>
  PaymentTransaction.create({
    id: '11111111-1111-4111-8111-111111111111',
    attemptId: 'sale-attempt-1',
    idempotencyKey: 'sale-idempotency-1',
    orderId: null,
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'SALE',
    amountCents: 2000,
    currency: 'CAD',
    externalPaymentId: 'sq-sale-1',
  })
    .transitionTo('PROCESSING')
    .applyProviderOutcome({
      status: 'SUCCEEDED',
      providerPaymentId: 'CLOVERPAY001',
      surchargeCents: 48,
      chargedTotalCents: 2048,
      refundedAmountCents: 0,
    });

const saleCanonical = (
  sale: PaymentTransaction,
  overrides: Partial<PaymentProviderOutcome> = {},
): PaymentProviderOutcome => {
  const snapshot = sale.toSnapshot();
  return {
    status: 'SUCCEEDED',
    evidence: 'CANONICAL',
    paymentId: snapshot.id,
    attemptId: snapshot.attemptId,
    idempotencyKey: snapshot.idempotencyKey,
    externalPaymentId: snapshot.externalPaymentId,
    providerPaymentId: snapshot.providerPaymentId,
    amountCents: snapshot.amountCents,
    currency: snapshot.currency,
    surchargeCents: 48,
    chargedTotalCents: 2048,
    refundedAmountCents: 0,
    ...overrides,
  };
};

const reversalCanonical = (
  request: StartOrRecoverRefundInput,
  paymentId: string,
): PaymentProviderOutcome => ({
  status: 'SUCCEEDED',
  evidence: 'CANONICAL',
  paymentId,
  attemptId: request.attemptId,
  idempotencyKey: request.idempotencyKey,
  providerPaymentId: request.originalProviderPaymentId,
  providerRefundId: 'CLOVERREF001',
  amountCents: request.amountCents,
  currency: request.currency,
  refundedAmountCents: request.amountCents,
  surchargeCents: 48,
  chargedTotalCents: 2048,
  resultCode: 'CLOVER_VOID_CONFIRMED',
});

const createHarness = async () => {
  const transactions = new InMemoryPaymentTransactionRepository();
  const sale = createSuccessfulSale();
  await transactions.create(sale);
  const provider: jest.Mocked<PaymentProvider> = {
    startPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    cancelPayment: jest.fn(),
    voidPayment: jest.fn(),
    refundPayment: jest.fn(),
  };
  const service = new RefundPaymentService(
    new CreatePaymentAttemptUseCase(transactions),
    transactions,
    provider,
  );
  const input: StartOrRecoverRefundInput = {
    attemptId: 'refund-attempt-1',
    idempotencyKey: 'refund-idempotency-1',
    orderId: '22222222-2222-4222-8222-222222222222',
    originalPaymentId: sale.id,
    operation: 'VOID',
    amountCents: 2000,
    currency: 'CAD',
    originalProviderPaymentId: 'CLOVERPAY001',
    expectedAdditionalChargeRefundCents: 48,
  };
  return { transactions, sale, provider, service, input };
};

describe('RefundPaymentService', () => {
  it('requires canonical preflight, executes void once, and records canonical reversal truth', async () => {
    const { transactions, sale, provider, service, input } = await createHarness();
    provider.getPaymentStatus.mockResolvedValue(saleCanonical(sale));
    provider.voidPayment.mockImplementation((request) =>
      Promise.resolve(reversalCanonical(input, request.paymentId)),
    );

    const reversal = await service.startOrRecover(input);

    expect(reversal.status).toBe('SUCCEEDED');
    expect(reversal.toSnapshot()).toMatchObject({
      operation: 'VOID',
      providerPaymentId: 'CLOVERPAY001',
      providerRefundId: 'CLOVERREF001',
      refundedAmountCents: 2000,
      chargedTotalCents: 2048,
    });
    expect(provider.voidPayment).toHaveBeenCalledTimes(1);
    expect(provider.refundPayment).not.toHaveBeenCalled();
    const refreshedSale = await transactions.findById(sale.id);
    expect(refreshedSale?.toSnapshot()).toMatchObject({
      status: 'SUCCEEDED',
      providerRefundId: 'CLOVERREF001',
      refundedAmountCents: 2000,
    });
  });

  it('does not resend an uncertain financial side effect and recovers through canonical read-back', async () => {
    const { sale, provider, service, input } = await createHarness();
    provider.getPaymentStatus
      .mockResolvedValueOnce(saleCanonical(sale))
      .mockImplementation((request) =>
        Promise.resolve(reversalCanonical(input, request.paymentId)),
      );
    provider.voidPayment.mockResolvedValue({
      status: 'UNKNOWN',
      providerPaymentId: 'CLOVERPAY001',
      failureCode: 'CLOVER_VOID_REQUEST_UNCERTAIN',
      failureMessage: 'socket closed',
    });

    const uncertain = await service.startOrRecover(input);
    expect(uncertain.status).toBe('UNKNOWN');
    const recovered = await service.startOrRecover(input);

    expect(recovered.status).toBe('SUCCEEDED');
    expect(provider.voidPayment).toHaveBeenCalledTimes(1);
    expect(provider.getPaymentStatus).toHaveBeenCalledTimes(2);
  });

  it('blocks a new managed reversal when Clover already reports refund activity', async () => {
    const { sale, provider, service, input } = await createHarness();
    provider.getPaymentStatus.mockResolvedValue(
      saleCanonical(sale, { refundedAmountCents: 500 }),
    );

    await expect(service.startOrRecover(input)).rejects.toMatchObject({
      name: 'PaymentReversalPreflightError',
      failureCode: 'PAYMENT_ORIGINAL_ALREADY_REFUNDED',
    } satisfies Partial<PaymentReversalPreflightError>);
    expect(provider.voidPayment).not.toHaveBeenCalled();
    expect(provider.refundPayment).not.toHaveBeenCalled();
  });

  it('does not accept an execution-only success as final reversal truth', async () => {
    const { sale, provider, service, input } = await createHarness();
    provider.getPaymentStatus.mockResolvedValue(saleCanonical(sale));
    provider.voidPayment.mockResolvedValue({
      status: 'SUCCEEDED',
      evidence: 'EXECUTION',
      providerPaymentId: 'CLOVERPAY001',
      refundedAmountCents: 2000,
      chargedTotalCents: 2048,
    });

    const reversal = await service.startOrRecover(input);

    expect(reversal.status).toBe('UNKNOWN');
    expect(reversal.toSnapshot().failureCode).toBe(
      'PAYMENT_REVERSAL_PROVIDER_CORRELATION_MISMATCH',
    );
  });

  it('returns the saved final reversal on duplicate requests without executing again', async () => {
    const { sale, provider, service, input } = await createHarness();
    provider.getPaymentStatus.mockResolvedValue(saleCanonical(sale));
    provider.voidPayment.mockImplementation((request) =>
      Promise.resolve(reversalCanonical(input, request.paymentId)),
    );

    const first = await service.startOrRecover(input);
    const second = await service.startOrRecover(input);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('SUCCEEDED');
    expect(provider.voidPayment).toHaveBeenCalledTimes(1);
  });
});
