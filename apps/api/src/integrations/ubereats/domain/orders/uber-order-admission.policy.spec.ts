import { UberOrderAdmissionPolicy } from './uber-order-admission.policy';

describe('UberOrderAdmissionPolicy', () => {
  const policy = new UberOrderAdmissionPolicy();
  const online = { status: 'ONLINE' as const, lastHeartbeatAt: new Date(0) };

  it.each([
    ['MALFORMED_PAYLOAD', '订单详情无法解析'],
    ['MISSING_ORDER_ID', '订单缺少 Uber order id'],
    ['MISSING_TOTAL', '订单缺少订单金额'],
    ['EMPTY_ITEMS', '订单不包含可导入商品'],
  ] as const)('denies invalid detail %s', (reason, reasonDetail) => {
    expect(policy.invalidDetail(reason)).toEqual({
      kind: 'DENY',
      denial: { reasonCode: 'INVALID_ORDER', reasonDetail },
    });
  });

  it('denies an unrelayable allergy request with Uber special-instructions reason', () => {
    expect(policy.invalidDetail('UNRELAYABLE_CUSTOMER_REQUEST')).toEqual({
      kind: 'DENY',
      denial: {
        reasonCode: 'SPECIAL_INSTRUCTIONS',
        reasonDetail: 'Uber customer request cannot be fully relayed to POS',
      },
    });
  });

  it('prioritizes missing menu identity before price and connectivity checks', () => {
    expect(
      policy.evaluate({
        missingItemReference: 'sanq:missing',
        hasPriceMismatch: true,
        hasMaterialAmountVariance: true,
        connectivity: { status: 'OFFLINE', lastHeartbeatAt: new Date(0) },
      }),
    ).toEqual({
      kind: 'DENY',
      denial: {
        reasonCode: 'ITEM_UNAVAILABLE',
        reasonDetail: '缺失菜单映射: sanq:missing',
      },
    });
  });

  it('denies an item without an Uber item id before persistence', () => {
    expect(
      policy.evaluate({
        missingItemReference: 'MISSING_EXTERNAL_ITEM_ID',
        hasPriceMismatch: false,
        hasMaterialAmountVariance: false,
        connectivity: online,
      }),
    ).toMatchObject({
      kind: 'DENY',
      denial: { reasonCode: 'ITEM_UNAVAILABLE' },
    });
  });

  it('denies material pricing mismatches', () => {
    expect(
      policy.evaluate({
        missingItemReference: null,
        hasPriceMismatch: true,
        hasMaterialAmountVariance: false,
        connectivity: online,
      }),
    ).toMatchObject({
      kind: 'DENY',
      denial: { reasonCode: 'PRICE_MISMATCH' },
    });
  });

  it('denies confirmed POS offline state', () => {
    expect(
      policy.evaluate({
        missingItemReference: null,
        hasPriceMismatch: false,
        hasMaterialAmountVariance: false,
        connectivity: { status: 'OFFLINE', lastHeartbeatAt: null },
      }),
    ).toEqual({
      kind: 'DENY',
      denial: {
        reasonCode: 'POS_OFFLINE',
        reasonDetail: 'POS connectivity offline; no recent heartbeat',
      },
    });
  });

  it.each(['ONLINE', 'UNKNOWN'] as const)(
    'accepts when business checks pass and connectivity is %s',
    (status) => {
      expect(
        policy.evaluate({
          missingItemReference: null,
          hasPriceMismatch: false,
          hasMaterialAmountVariance: false,
          connectivity: { status, lastHeartbeatAt: null },
        }),
      ).toEqual({ kind: 'ACCEPT' });
    },
  );
});
