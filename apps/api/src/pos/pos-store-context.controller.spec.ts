import { PosStoreContextController } from './pos-summary.controller';

const configuredStore = {
  storeStableId: '4750_Yonge_Street',
  storeName: 'Configured Store',
  isActive: true,
  timezone: 'America/Toronto',
  isTemporarilyClosed: false,
  temporaryCloseReason: null,
  publicNotice: null,
  publicNoticeEn: null,
  deliveryBaseFeeCents: 0,
  priorityPerKmCents: 0,
  maxDeliveryRangeKm: 0,
  priorityDefaultDistanceKm: 0,
  latitude: null,
  longitude: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  countryCode: 'CA',
  phone: null,
  contactName: null,
  salesTaxRate: 0.13,
  enableUberDirect: false,
  autoAcceptOnlineOrders: false,
  allergyHandlingMode: 'RELAY_ALL' as const,
  unsupportedAllergens: [],
};

const authenticatedStore = {
  ...configuredStore,
  storeStableId: 'store_b',
  storeName: 'Authenticated Device Store',
  timezone: 'America/Vancouver',
};

describe('PosStoreContextController', () => {
  it('reads the context for the authenticated POS device store instead of the configured default store', async () => {
    const getStoreSnapshot = jest.fn((storeStableId?: string) =>
      Promise.resolve(
        storeStableId === authenticatedStore.storeStableId
          ? authenticatedStore
          : configuredStore,
      ),
    );
    const controller = new PosStoreContextController({
      getStoreSnapshot,
    } as never);

    await expect(
      controller.getStoreContext({
        posDevice: {
          deviceStableId: 'device_b',
          storeStableId: authenticatedStore.storeStableId,
          name: 'Store B Front POS',
        },
      } as never),
    ).resolves.toEqual({
      storeStableId: authenticatedStore.storeStableId,
      storeName: authenticatedStore.storeName,
      timezone: authenticatedStore.timezone,
    });

    expect(getStoreSnapshot).toHaveBeenCalledTimes(1);
    expect(getStoreSnapshot).toHaveBeenCalledWith(
      authenticatedStore.storeStableId,
    );
  });

  it('rejects requests when the authenticated POS store identity is unavailable', async () => {
    const getStoreSnapshot = jest.fn();
    const controller = new PosStoreContextController({
      getStoreSnapshot,
    } as never);

    await expect(controller.getStoreContext({} as never)).rejects.toThrow(
      'POS device store unavailable',
    );
    expect(getStoreSnapshot).not.toHaveBeenCalled();
  });
});
