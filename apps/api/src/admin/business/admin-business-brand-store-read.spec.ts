import type { BrandStoreConfigSnapshot } from '../../store/public-api';
import { AdminBusinessService } from './admin-business.service';

const brandStoreConfig: BrandStoreConfigSnapshot = {
  brand: {
    brandNameZh: '三秦肉夹馍',
    brandNameEn: 'SanQ Roujiamo',
    siteUrl: 'https://sanq.ca',
    emailFromNameZh: '三秦肉夹馍',
    emailFromNameEn: 'SanQ Roujiamo',
    emailFromAddress: 'hello@sanq.ca',
    smsSignature: 'SanQ',
    supportPhone: '+1-437-808-6888',
    supportEmail: 'support@sanq.ca',
    wechatAlipayExchangeRate: 5.12,
  },
  store: {
    storeStableId: '4750_Yonge_Street',
    storeName: 'SanQ Roujiamo - Yonge',
    isActive: true,
    timezone: 'America/Toronto',
    isTemporarilyClosed: true,
    temporaryCloseReason: 'Kitchen maintenance',
    publicNotice: '中文通知',
    publicNoticeEn: 'English notice',
    deliveryBaseFeeCents: 600,
    priorityPerKmCents: 100,
    maxDeliveryRangeKm: 10,
    priorityDefaultDistanceKm: 3,
    latitude: 43.760288,
    longitude: -79.412167,
    addressLine1: '4750 Yonge St.',
    addressLine2: 'Unit 138',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M2N 5M6',
    countryCode: 'CA',
    phone: '+1-437-808-6888',
    contactName: 'San Qin',
    salesTaxRate: 0.13,
    enableUberDirect: true,
    autoAcceptOnlineOrders: true,
    allergyHandlingMode: 'DENY_LIST',
    unsupportedAllergens: ['PEANUTS'],
  },
};

function setup() {
  const brandStoreConfigReader = {
    getSnapshot: jest.fn().mockResolvedValue(brandStoreConfig),
    getBrandSnapshot: jest.fn().mockResolvedValue(brandStoreConfig.brand),
    getStoreSnapshot: jest.fn().mockResolvedValue(brandStoreConfig.store),
    getConfiguredStoreSnapshot: jest
      .fn()
      .mockResolvedValue(brandStoreConfig.store),
  };
  const brandStoreConfigWriter = {
    updateBrandConfig: jest.fn().mockResolvedValue(undefined),
    updateStoreConfig: jest.fn().mockResolvedValue(undefined),
  };
  const storeScheduleReader = {
    listBusinessHours: jest.fn().mockResolvedValue([
      {
        weekday: 1,
        openMinutes: 660,
        closeMinutes: 1260,
        isClosed: false,
      },
    ]),
    listHolidays: jest.fn().mockResolvedValue([
      {
        date: '2026-12-25',
        name: 'Christmas',
        isClosed: true,
        openMinutes: null,
        closeMinutes: null,
      },
    ]),
  };
  const storeScheduleWriter = {
    replaceBusinessHours: jest.fn().mockResolvedValue(undefined),
    replaceHolidays: jest.fn().mockResolvedValue(undefined),
  };
  const uber = {
    syncStoreStatusToUber: jest.fn().mockResolvedValue({
      outcome: 'SUCCEEDED',
      synchronizedStores: 1,
    }),
  };
  const service = new AdminBusinessService(
    brandStoreConfigReader as never,
    brandStoreConfigWriter as never,
    storeScheduleReader as never,
    storeScheduleWriter as never,
    uber as never,
  );

  return {
    service,
    brandStoreConfigReader,
    brandStoreConfigWriter,
    storeScheduleReader,
    storeScheduleWriter,
    uber,
  };
}

describe('AdminBusinessService canonical Brand/Store reads', () => {
  it('updates BrandConfig without resolving any Store identity', async () => {
    const { service, brandStoreConfigReader, brandStoreConfigWriter } = setup();

    await service.updateBrandConfig({
      brandNameEn: ' SanQ Updated ',
      wechatAlipayExchangeRate: 5.2,
    });

    expect(brandStoreConfigWriter.updateBrandConfig).toHaveBeenCalledWith({
      brandNameEn: 'SanQ Updated',
      wechatAlipayExchangeRate: 5.2,
    });
    expect(brandStoreConfigReader.getStoreSnapshot).not.toHaveBeenCalled();
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('reads StoreConfig only through an explicit storeStableId', async () => {
    const { service, brandStoreConfigReader } = setup();

    await expect(service.getStoreConfig('second_store')).resolves.toEqual(
      brandStoreConfig.store,
    );

    expect(brandStoreConfigReader.getStoreSnapshot).toHaveBeenCalledWith(
      'second_store',
    );
  });

  it('writes StoreConfig contact and online-order settings through the owner writer', async () => {
    const { service, brandStoreConfigWriter } = setup();

    await service.updateStoreConfig(
      {
        countryCode: ' ca ',
        phone: ' +1 416 555 0100 ',
        contactName: ' Front counter ',
        autoAcceptOnlineOrders: false,
      },
      brandStoreConfig.store.storeStableId,
    );

    expect(brandStoreConfigWriter.updateStoreConfig).toHaveBeenCalledWith(
      brandStoreConfig.store.storeStableId,
      {
        countryCode: 'CA',
        phone: '+1 416 555 0100',
        contactName: 'Front counter',
        autoAcceptOnlineOrders: false,
      },
    );
  });

  it('targets the selected storeStableId when updating StoreConfig', async () => {
    const { service, brandStoreConfigWriter } = setup();

    await service.updateStoreConfig({ salesTaxRate: 0.15 }, 'second_store');

    expect(brandStoreConfigWriter.updateStoreConfig).toHaveBeenCalledWith(
      'second_store',
      { salesTaxRate: 0.15 },
    );
  });
});
