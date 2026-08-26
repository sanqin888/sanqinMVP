import { CloverPaymentProviderAdapter } from './clover-payment-provider.adapter';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';

describe('CloverPaymentProviderAdapter', () => {
  const createAdapter = () => {
    const config = new CloverProviderConfig();
    const ecommerce = new CloverEcommerceTransport(config);
    const terminal = new CloverTerminalTransport(config);
    return {
      adapter: new CloverPaymentProviderAdapter(ecommerce, terminal),
      ecommerce,
    };
  };

  it('routes Web Ecommerce through the Ecommerce transport and normalizes success', async () => {
    const { adapter, ecommerce } = createAdapter();
    const createCardPayment = jest
      .spyOn(ecommerce, 'createCardPayment')
      .mockResolvedValue({
        ok: true,
        paymentId: 'clover_pay_1',
        status: 'succeeded',
      });

    await expect(
      adapter.startPayment({
        paymentId: 'payment_1',
        amountCents: 1024,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'WEB_ECOMMERCE',
        idempotencyKey: 'attempt_1',
        externalPaymentId: 'checkout_1',
        paymentInstrumentToken: 'token_1',
        description: 'Online Order checkout_1',
      }),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      externalPaymentId: 'checkout_1',
      providerPaymentId: 'clover_pay_1',
      resultCode: 'succeeded',
    });

    expect(createCardPayment).toHaveBeenCalledWith({
      amountCents: 1024,
      currency: 'CAD',
      source: 'token_1',
      orderId: 'payment_1',
      externalPaymentId: 'checkout_1',
      idempotencyKey: 'attempt_1',
      description: 'Online Order checkout_1',
    });
  });

  it('rejects Web Ecommerce start without a payment instrument token', async () => {
    const { adapter, ecommerce } = createAdapter();
    const createCardPayment = jest.spyOn(ecommerce, 'createCardPayment');

    await expect(
      adapter.startPayment({
        paymentId: 'payment_2',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'WEB_ECOMMERCE',
        idempotencyKey: 'attempt_2',
      }),
    ).resolves.toEqual({
      status: 'FAILED',
      failureCode: 'CLOVER_PAYMENT_INSTRUMENT_REQUIRED',
      failureMessage: 'Clover Ecommerce requires a payment instrument token',
    });

    expect(createCardPayment).not.toHaveBeenCalled();
  });

  it('keeps Clover Terminal disabled in Phase B', async () => {
    const { adapter } = createAdapter();

    await expect(
      adapter.startPayment({
        paymentId: 'payment_terminal',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
      }),
    ).resolves.toEqual({
      status: 'FAILED',
      failureCode: 'CLOVER_TERMINAL_NOT_ENABLED',
      failureMessage: 'Clover Terminal transport is not enabled in Phase B',
    });
  });
});
