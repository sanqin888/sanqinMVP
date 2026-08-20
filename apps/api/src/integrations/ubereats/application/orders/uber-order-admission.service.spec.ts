import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';
import { UberOrderAdmissionService } from './uber-order-admission.service';

const parsedOrder = (): ParsedUberOrder => ({
  externalOrderId: 'order-1',
  displayId: 'A0001',
  pickupCode: 'A0001',
  uberStoreId: 'uber-store-1',
  subtotalCents: 100,
  taxCents: 0,
  totalCents: 100,
  discountCents: 0,
  hasPromotion: false,
  deliveryFeeCents: 0,
  fulfillmentType: 'pickup',
  fulfillmentTiming: 'IMMEDIATE',
  scheduledReadyAt: null,
  estimatedReadyAt: null,
  specialInstructions: null,
  items: [
    {
      externalLineId: 'line-1',
      externalItemId: 'item-1',
      stableIdHint: null,
      displayName: 'Fixture item',
      quantity: 1,
      baseUnitPriceCents: 100,
      optionsUnitPriceCents: 0,
      unitPriceCents: 100,
      lineTotalCents: 100,
      specialInstructions: null,
      modifiers: [],
    },
  ],
  paidAt: new Date('2026-08-20T13:00:00.000Z'),
  cancellation: null,
});

const provisionedStore = {
  uberStoreId: 'uber-store-1',
  isProvisioned: true,
  posExternalStoreId: 'pos-store-1',
};

describe('UberOrderAdmissionService', () => {
  it('collects store, menu and connectivity facts before returning ACCEPT', async () => {
    const findMenuMappings = jest.fn().mockResolvedValue([
      {
        externalItemId: 'item-1',
        menuItemStableId: 'menu-1',
        expectedPriceCents: 100,
      },
    ]);
    const getPosStoreConnectivity = jest.fn().mockResolvedValue({
      status: 'ONLINE',
      lastHeartbeatAt: new Date(),
    });
    const findMapping = jest.fn().mockResolvedValue(provisionedStore);
    const service = new UberOrderAdmissionService(
      {
        findMenuMappings,
        getPosStoreConnectivity,
      } as never,
      { findMapping } as never,
    );

    await expect(
      service.evaluate(parsedOrder(), 'event-1'),
    ).resolves.toMatchObject({
      posStoreId: 'pos-store-1',
      canPersistOrder: true,
      decision: { kind: 'ACCEPT' },
    });
    expect(findMapping).toHaveBeenCalledWith('uber-store-1');
    expect(findMenuMappings).toHaveBeenCalledWith('uber-store-1', ['item-1']);
    expect(getPosStoreConnectivity).toHaveBeenCalledWith('pos-store-1');
  });

  it('returns a non-persistable DENY when the published menu mapping is missing', async () => {
    const getPosStoreConnectivity = jest.fn();
    const service = new UberOrderAdmissionService(
      {
        findMenuMappings: jest.fn().mockResolvedValue([]),
        getPosStoreConnectivity,
      } as never,
      { findMapping: jest.fn().mockResolvedValue(provisionedStore) } as never,
    );

    await expect(
      service.evaluate(parsedOrder(), 'event-1'),
    ).resolves.toMatchObject({
      canPersistOrder: false,
      decision: {
        kind: 'DENY',
        denial: {
          reasonCode: 'ITEM_UNAVAILABLE',
          reasonDetail: '缺失菜单映射: item-1',
        },
      },
    });
    expect(getPosStoreConnectivity).not.toHaveBeenCalled();
  });

  it('rejects missing Uber item identity before persistence', async () => {
    const order = parsedOrder();
    const firstItem = order.items[0];
    if (!firstItem) throw new Error('test fixture requires one order item');
    firstItem.externalItemId = null;
    const service = new UberOrderAdmissionService(
      {
        findMenuMappings: jest.fn().mockResolvedValue([]),
        getPosStoreConnectivity: jest.fn(),
      } as never,
      { findMapping: jest.fn().mockResolvedValue(provisionedStore) } as never,
    );

    await expect(service.evaluate(order, 'event-1')).resolves.toMatchObject({
      canPersistOrder: false,
      decision: {
        kind: 'DENY',
        denial: { reasonCode: 'ITEM_UNAVAILABLE' },
      },
    });
  });

  it.each([
    ['UBER_STORE_MAPPING_NOT_FOUND', null],
    [
      'UBER_STORE_MAPPING_NOT_PROVISIONED',
      {
        uberStoreId: 'uber-store-1',
        isProvisioned: false,
        posExternalStoreId: 'pos-store-1',
      },
    ],
  ])(
    'keeps store configuration failures retryable: %s',
    async (code, mapping) => {
      const service = new UberOrderAdmissionService(
        { findMenuMappings: jest.fn() } as never,
        { findMapping: jest.fn().mockResolvedValue(mapping) } as never,
      );

      await expect(
        service.evaluate(parsedOrder(), 'event-1'),
      ).rejects.toMatchObject({
        code,
        retryable: true,
      });
    },
  );
});
