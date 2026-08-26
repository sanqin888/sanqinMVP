import {
  toChargeStatusSuccess,
  toProviderOutcomeFromCreate,
  toProviderOutcomeFromStatus,
} from './clover-ecommerce.mapper';

describe('Clover Ecommerce response mapper', () => {
  it('prefers the provider charged total over the base amount', () => {
    expect(
      toChargeStatusSuccess({
        id: 'pay_123',
        amount: 133,
        totalAmount: 136,
        currency: 'CAD',
        result: 'SUCCESS',
        captured: true,
      }),
    ).toEqual({
      ok: true,
      paymentId: 'pay_123',
      status: 'SUCCESS',
      captured: true,
      currency: 'CAD',
      baseAmountCents: 133,
      chargedTotalCents: 136,
    });
  });

  it('normalizes successful create results into SanQ payment outcomes', () => {
    expect(
      toProviderOutcomeFromCreate(
        { ok: true, paymentId: 'pay_123', status: 'succeeded' },
        'checkout_123',
      ),
    ).toEqual({
      status: 'SUCCEEDED',
      externalPaymentId: 'checkout_123',
      providerPaymentId: 'pay_123',
      resultCode: 'succeeded',
    });
  });

  it('normalizes Clover declines without leaking the provider payload', () => {
    expect(
      toProviderOutcomeFromCreate(
        {
          ok: false,
          reason: 'card declined',
          status: 'declined',
          code: 'card_declined',
          paymentId: 'pay_declined',
        },
        'checkout_declined',
      ),
    ).toEqual({
      status: 'DECLINED',
      externalPaymentId: 'checkout_declined',
      providerPaymentId: 'pay_declined',
      resultCode: 'declined',
      failureCode: 'card_declined',
      failureMessage: 'card declined',
    });
  });

  it('maps status money and identifiers into provider-neutral fields', () => {
    expect(
      toProviderOutcomeFromStatus({
        ok: true,
        paymentId: 'pay_456',
        externalPaymentId: 'checkout_456',
        status: 'succeeded',
        captured: true,
        currency: 'CAD',
        baseAmountCents: 1000,
        chargedTotalCents: 1024,
        creditSurchargeCents: 24,
      }),
    ).toEqual({
      status: 'SUCCEEDED',
      externalPaymentId: 'checkout_456',
      providerPaymentId: 'pay_456',
      chargedTotalCents: 1024,
      surchargeCents: 24,
      resultCode: 'succeeded',
    });
  });
});
