import {
  StoreStableIdAlreadyExistsError,
  type StoreConfigSnapshot,
} from './brand-store-config.contract';
import {
  InvalidStoreDirectoryInputError,
  StoreDirectoryService,
} from './store-directory.service';

const createdStore: StoreConfigSnapshot = {
  storeStableId: 'second_store',
  storeName: 'Second Store',
  isActive: true,
  timezone: 'America/Toronto',
  isTemporarilyClosed: false,
  temporaryCloseReason: null,
  publicNotice: null,
  publicNoticeEn: null,
  deliveryBaseFeeCents: 600,
  priorityPerKmCents: 100,
  maxDeliveryRangeKm: 10,
  priorityDefaultDistanceKm: 6,
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
  enableUberDirect: true,
  autoAcceptOnlineOrders: true,
  allergyHandlingMode: 'RELAY_ALL',
  unsupportedAllergens: [],
};

function setup(existingStableId = '4750_Yonge_Street') {
  const reader = {
    listStores: jest.fn().mockResolvedValue([
      {
        storeStableId: existingStableId,
        storeName: 'Yonge Store',
        isActive: true,
      },
    ]),
  };
  const writer = {
    createStore: jest.fn().mockResolvedValue(createdStore),
  };
  return {
    reader,
    writer,
    service: new StoreDirectoryService(reader as never, writer as never),
  };
}

describe('StoreDirectoryService', () => {
  it('normalizes and provisions a unique Store stable id', async () => {
    const { service, reader, writer } = setup();

    await expect(
      service.createStore({
        storeName: ' Second Store ',
        storeStableId: ' second_store ',
      }),
    ).resolves.toEqual(createdStore);

    expect(reader.listStores).toHaveBeenCalledTimes(1);
    expect(writer.createStore).toHaveBeenCalledWith({
      storeName: 'Second Store',
      storeStableId: 'second_store',
    });
  });

  it('rejects an existing Store stable id case-insensitively before persistence', async () => {
    const { service, writer } = setup('SECOND_STORE');

    await expect(
      service.createStore({
        storeName: 'Second Store',
        storeStableId: 'second_store',
      }),
    ).rejects.toEqual(expect.any(StoreStableIdAlreadyExistsError));

    expect(writer.createStore).not.toHaveBeenCalled();
  });

  it('rejects an invalid Store stable id before persistence', async () => {
    const { service, writer } = setup();

    await expect(
      service.createStore({
        storeName: 'Second Store',
        storeStableId: 'second store',
      }),
    ).rejects.toEqual(expect.any(InvalidStoreDirectoryInputError));

    expect(writer.createStore).not.toHaveBeenCalled();
  });
});
