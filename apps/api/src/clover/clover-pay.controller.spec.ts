import { reconcileChargeAmount } from './reconcile-charge';

describe('reconcileChargeAmount', () => {
  it('在 provider 返回 surcharge 时优先采用 provider 结果', () => {
    const result = reconcileChargeAmount({
      intentAmountCents: 168,
      chargedAmountCents: 172,
      surchargeCents: 4,
      allowRateFallbackWhenEqual: true,
    });

    expect(result).toEqual({
      surchargeCents: 4,
      mismatchBeyondTolerance: false,
      mode: 'provider',
      expectedChargeByRateCents: 172,
    });
  });

  it('在 charged==intent 且 provider 未返回 surcharge 时按费率回填', () => {
    const result = reconcileChargeAmount({
      intentAmountCents: 168,
      chargedAmountCents: 168,
      surchargeCents: 0,
      allowRateFallbackWhenEqual: true,
    });

    expect(result).toEqual({
      surchargeCents: 4,
      mismatchBeyondTolerance: false,
      mode: 'fallback_rate_on_base',
      expectedChargeByRateCents: 172,
    });
  });

  it('在不允许 equal 回填时保持旧行为并标记异常', () => {
    const result = reconcileChargeAmount({
      intentAmountCents: 168,
      chargedAmountCents: 168,
      surchargeCents: 0,
      allowRateFallbackWhenEqual: false,
    });

    expect(result).toEqual({
      surchargeCents: 0,
      mismatchBeyondTolerance: true,
      mode: 'fallback_actual_diff',
      expectedChargeByRateCents: 172,
    });
  });
});
