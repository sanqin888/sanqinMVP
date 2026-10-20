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
      tipCents: null,
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
      tipCents: 200,
      surchargeCents: 31,
      chargedTotalCents: 1530,
      terminalId: 'terminal-1',
      cardBrand: 'VISA',
      cardLast4: '4242',
    });

    expect(succeeded.toSnapshot()).toMatchObject({
      status: 'SUCCEEDED',
      externalPaymentId: 'external-123',
      providerPaymentId: 'clover-payment-123',
      providerOrderId: 'clover-order-123',
      tipCents: 200,
      surchargeCents: 31,
      chargedTotalCents: 1530,
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

  it.each([
    { operation: 'VOID' as const, providerRefundId: null, expected: 'VOIDED' },
    {
      operation: 'VOID' as const,
      providerRefundId: 'refund-1',
      expected: 'REFUNDED',
    },
    {
      operation: 'REFUND' as const,
      providerRefundId: 'refund-1',
      expected: 'REFUNDED',
    },
  ])(
    'classifies the actual confirmed reversal without changing the requested operation: %p',
    (facts) => {
      const payment = PaymentTransaction.create({
        ...baseInput,
        operation: facts.operation,
      })
        .transitionTo('PROCESSING')
        .applyProviderOutcome({
          status: 'SUCCEEDED',
          providerPaymentId: 'original-payment',
          providerRefundId: facts.providerRefundId,
          refundedAmountCents: baseInput.amountCents,
        });
      expect(payment.reversalOutcome).toBe(facts.expected);
      expect(
        PaymentTransaction.restore(payment.toSnapshot()).reversalOutcome,
      ).toBe(facts.expected);
      expect(payment.toSnapshot().operation).toBe(facts.operation);
    },
  );

  it('does not classify a Sale or an unconfirmed reversal as successful', () => {
    const sale = PaymentTransaction.create(baseInput)
      .transitionTo('PROCESSING')
      .applyProviderOutcome({ status: 'SUCCEEDED', providerPaymentId: 'sale' });
    const unknown = PaymentTransaction.create({ ...baseInput, operation: 'VOID' })
      .transitionTo('PROCESSING')
      .applyProviderOutcome({
        status: 'UNKNOWN',
        providerPaymentId: 'sale',
        providerRefundId: 'refund',
      });
    expect(sale.reversalOutcome).toBeNull();
    expect(unknown.reversalOutcome).toBeNull();
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
