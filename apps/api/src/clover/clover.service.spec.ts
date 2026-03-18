import { toChargeStatusSuccess } from './clover.service';

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
