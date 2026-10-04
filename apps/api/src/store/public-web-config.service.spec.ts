import { ServiceUnavailableException } from '@nestjs/common';
import type { BrandStoreConfigReaderPort } from './brand-store-config.contract';
import { PublicWebConfigService } from './public-web-config.service';

const originalBrowserKey = process.env.GOOGLE_MAPS_BROWSER_KEY;

afterEach(() => {
  if (originalBrowserKey === undefined) {
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
  } else {
    process.env.GOOGLE_MAPS_BROWSER_KEY = originalBrowserKey;
  }
});

function createReader(
  overrides: Partial<
    Awaited<
      ReturnType<BrandStoreConfigReaderPort['getConfiguredStoreSnapshot']>
    >
  > = {},
): BrandStoreConfigReaderPort {
  const store = {
    storeStableId: '4750_Yonge_Street',
    storeName: 'SanQ Roujiamo',
    isActive: true,
    timezone: 'America/Toronto',
    isTemporarilyClosed: false,
    temporaryCloseReason: null,
    publicNotice: null,
    publicNoticeEn: null,
    deliveryBaseFeeCents: 0,
    priorityPerKmCents: 0,
    maxDeliveryRangeKm: 10,
    priorityDefaultDistanceKm: 5,
    latitude: 43.760288,
    longitude: -79.412167,
    addressLine1: '4750 Yonge St.',
    addressLine2: 'Unit 138',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M2N 5M6',
    countryCode: 'CA',
    phone: null,
    contactName: null,
    salesTaxRate: 0.13,
    enableUberDirect: true,
    autoAcceptOnlineOrders: true,
    allergyHandlingMode: 'RELAY_ALL' as const,
    unsupportedAllergens: [],
    ...overrides,
  };

  return {
    getBrandSnapshot: jest.fn(),
    getStoreSnapshot: jest.fn(),
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(store),
  };
}

describe('PublicWebConfigService', () => {
  it('returns only browser-safe Maps and canonical StoreConfig coordinates', async () => {
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-key';

    const service = new PublicWebConfigService(createReader());

    await expect(service.getConfig()).resolves.toEqual({
      store: {
        storeStableId: '4750_Yonge_Street',
        latitude: 43.760288,
        longitude: -79.412167,
      },
      maps: {
        browserKey: 'browser-key',
      },
    });
  });

  it('fails closed when the browser key is missing', async () => {
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;

    const service = new PublicWebConfigService(createReader());

    await expect(service.getConfig()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when StoreConfig coordinates are unavailable', async () => {
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-key';

    const service = new PublicWebConfigService(
      createReader({ latitude: null, longitude: null }),
    );

    await expect(service.getConfig()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
