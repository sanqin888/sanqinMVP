import { CloverProviderConfig } from '../payments/infrastructure/clover/clover-provider.config';
import { toChargeStatusSuccess } from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.mapper';
import { CloverEcommerceTransport } from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.transport';
import { CloverService } from './clover.service';

describe('toChargeStatusSuccess', () => {
  it('优先采用 Clover 返回的实际 charged total 作为总扣款金额', () => {
    const result = toChargeStatusSuccess({
      id: 'pay_123',
      amount: 133,
      totalAmount: 136,
      currency: 'CAD',
      result: 'SUCCESS',
      captured: true,
    });

    expect(result).toEqual({
      ok: true,
      paymentId: 'pay_123',
      status: 'SUCCESS',
      captured: true,
      currency: 'CAD',
      baseAmountCents: 133,
      chargedTotalCents: 136,
    });
  });

  it('支持从字符串形式的 total 字段读取实际总扣款金额', () => {
    const result = toChargeStatusSuccess({
      id: 'pay_456',
      amount: 133,
      total: '136',
      currency: 'CAD',
      status: 'succeeded',
      captured: true,
    });

    expect(result).toEqual({
      ok: true,
      paymentId: 'pay_456',
      status: 'succeeded',
      captured: true,
      currency: 'CAD',
      baseAmountCents: 133,
      chargedTotalCents: 136,
    });
  });
});

describe('CloverService compatibility facade', () => {
  it('preserves the existing createCardPayment request and result shape', async () => {
    const transport = new CloverEcommerceTransport(new CloverProviderConfig());
    const service = new CloverService(transport);
    const createCardPayment = jest
      .spyOn(transport, 'createCardPayment')
      .mockResolvedValue({
        ok: true,
        paymentId: 'pay_web_1',
        status: 'succeeded',
      });

    const request = {
      amountCents: 1024,
      currency: 'CAD',
      source: 'token_web_1',
      orderId: 'checkout_web_1',
      externalPaymentId: 'checkout_web_1',
      idempotencyKey: 'checkout_web_1',
      description: 'Online Order checkout_web_1',
    };

    await expect(service.createCardPayment(request)).resolves.toEqual({
      ok: true,
      paymentId: 'pay_web_1',
      status: 'succeeded',
    });
    expect(createCardPayment).toHaveBeenCalledWith(request);
  });
});
