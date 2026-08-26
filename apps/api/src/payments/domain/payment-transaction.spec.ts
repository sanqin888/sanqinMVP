import {
  InvalidPaymentStateTransitionError,
  canTransitionPaymentStatus,
} from './payment-state-machine';
import { PaymentTransaction } from './payment-transaction';

const baseInput = {
  id: '0f9a2139-c482-4ad6-946e-16642f078a0a',
  attemptId: 'pos-checkout-123-attempt-1',
  idempotencyKey: 'pos-checkout-123-attempt-1-sale',
  provider: 'CLOVER' as const,
  source: 'POS_TERMINAL' as const,
  paymentMethod: 'CARD' as const,
  operation: 'SALE' as const,
  amountCents: 1299,
  currency: 'CAD',
};

describe('PaymentTransaction', () => {
  it('creates a payment attempt without inventing provider money facts', () => {
    const createdAt = new Date('2026-08-25T20:00:00.000Z');
    const payment = PaymentTransaction.create({ ...baseInput, createdAt });

    expect(payment.toSnapshot()).toMatchObject({
      ...baseInput,
      status: 'CREATED',
      surchargeCents: null,
      chargedTotalCents: null,
      refundedAmountCents: 0,
      externalPaymentId: null,
      providerPaymentId: null,
      processedAt: null,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('supports the unknown -> reconciling recovery path before a final result', () => {
    const processingAt = new Date('2026-08-25T20:01:00.000Z');
    const unknownAt = new Date('2026-08-25T20:02:00.000Z');
    const reconcilingAt = new Date('2026-08-25T20:03:00.000Z');
    const succeededAt = new Date('2026-08-25T20:04:00.000Z');

    const succeeded = PaymentTransaction.create(baseInput)
      .transitionTo('PROCESSING', processingAt)
      .transitionTo('UNKNOWN', unknownAt)
      .transitionTo('RECONCILING', reconcilingAt)
      .transitionTo('SUCCEEDED', succeededAt)
      .toSnapshot();

    expect(succeeded.status).toBe('SUCCEEDED');
    expect(succeeded.processedAt).toEqual(processingAt);
    expect(succeeded.completedAt).toEqual(succeededAt);
  });

  it('allows canonical recovery to settle UNKNOWN directly without forcing an intermediate write', () => {
    const payment = PaymentTransaction.create(baseInput)
      .transitionTo('PROCESSING')
      .transitionTo('UNKNOWN');

    expect(payment.transitionTo('SUCCEEDED').status).toBe('SUCCEEDED');
    expect(canTransitionPaymentStatus('UNKNOWN', 'DECLINED')).toBe(true);
  });

  it('rejects skipping directly from CREATED to SUCCEEDED', () => {
    const payment = PaymentTransaction.create(baseInput);

    expect(() => payment.transitionTo('SUCCEEDED')).toThrow(
      InvalidPaymentStateTransitionError,
    );
    expect(canTransitionPaymentStatus('CREATED', 'SUCCEEDED')).toBe(false);
  });

  it('keeps final states final', () => {
    const payment = PaymentTransaction.create(baseInput)
      .transitionTo('PROCESSING')
      .transitionTo('DECLINED');

    expect(() => payment.transitionTo('PROCESSING')).toThrow(
      InvalidPaymentStateTransitionError,
    );
  });

  it('records only explicit provider facts on a provider outcome', () => {
    const payment =
      PaymentTransaction.create(baseInput).transitionTo('PROCESSING');

    const succeeded = payment.applyProviderOutcome({
      status: 'SUCCEEDED',
      externalPaymentId: 'external-123',
      providerPaymentId: 'clover-payment-123',
      providerOrderId: 'clover-order-123',
      surchargeCents: 31,
      chargedTotalCents: 1330,
      terminalId: 'terminal-1',
      cardBrand: 'VISA',
      cardLast4: '4242',
    });

    expect(succeeded.toSnapshot()).toMatchObject({
      status: 'SUCCEEDED',
      externalPaymentId: 'external-123',
      providerPaymentId: 'clover-payment-123',
      providerOrderId: 'clover-order-123',
      surchargeCents: 31,
      chargedTotalCents: 1330,
      terminalId: 'terminal-1',
      cardBrand: 'VISA',
      cardLast4: '4242',
    });
  });

  it('does not allow a recorded provider transaction identity to be rewritten', () => {
    const payment = PaymentTransaction.create(baseInput).applyProviderOutcome({
      status: 'PROCESSING',
      externalPaymentId: 'external-123',
      providerPaymentId: 'clover-payment-123',
    });

    expect(() =>
      payment.applyProviderOutcome({
        status: 'UNKNOWN',
        externalPaymentId: 'external-456',
      }),
    ).toThrow('externalPaymentId cannot change once recorded');
  });

  it('rejects invalid identifiers, money and currency at the domain boundary', () => {
    expect(() =>
      PaymentTransaction.create({ ...baseInput, attemptId: '   ' }),
    ).toThrow('payment attempt id');
    expect(() =>
      PaymentTransaction.create({ ...baseInput, idempotencyKey: '   ' }),
    ).toThrow('payment idempotency key');
    expect(() =>
      PaymentTransaction.create({ ...baseInput, amountCents: -1 }),
    ).toThrow('amountCents');
    expect(() =>
      PaymentTransaction.create({ ...baseInput, currency: 'cad' }),
    ).toThrow('currency');
  });
});
