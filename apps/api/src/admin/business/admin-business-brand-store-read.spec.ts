import { BadRequestException } from '@nestjs/common';
import type { BrandStoreConfigSnapshot } from '../../store/public-api';
import { AdminBusinessController } from './admin-business.controller';
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
  };
  const brandStoreConfigWriter = {
    updateConfig: jest.fn().mockResolvedValue(undefined),
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
  it('builds the admin response from owner readers only', async () => {
    const { service, brandStoreConfigReader, storeScheduleReader } = setup();

    await expect(service.getConfig()).resolves.toEqual({
      timezone: 'America/Toronto',
      isTemporarilyClosed: true,
      temporaryCloseReason: 'Kitchen maintenance',
      publicNotice: '中文通知',
      publicNoticeEn: 'English notice',
      deliveryBaseFeeCents: 600,
      priorityPerKmCents: 100,
      maxDeliveryRangeKm: 10,
      priorityDefaultDistanceKm: 3,
      storeLatitude: 43.760288,
      storeLongitude: -79.412167,
      storeAddressLine1: '4750 Yonge St.',
      storeAddressLine2: 'Unit 138',
      storeCity: 'Toronto',
      storeProvince: 'ON',
      storePostalCode: 'M2N 5M6',
      brandNameZh: '三秦肉夹馍',
      brandNameEn: 'SanQ Roujiamo',
      siteUrl: 'https://sanq.ca',
      emailFromNameZh: '三秦肉夹馍',
      emailFromNameEn: 'SanQ Roujiamo',
      emailFromAddress: 'hello@sanq.ca',
      smsSignature: 'SanQ',
      supportPhone: '+1-437-808-6888',
      supportEmail: 'support@sanq.ca',
      salesTaxRate: 0.13,
      wechatAlipayExchangeRate: 5.12,
      enableUberDirect: true,
      allergyHandlingMode: 'DENY_LIST',
      unsupportedAllergens: ['PEANUTS'],
      hours: [
        {
          weekday: 1,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ],
      holidays: [
        {
          date: '2026-12-25',
          name: 'Christmas',
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        },
      ],
    });

    expect(brandStoreConfigReader.getSnapshot).toHaveBeenCalledTimes(1);
    expect(storeScheduleReader.listBusinessHours).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(storeScheduleReader.listHolidays).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
  });

  it('uses the Brand/Store owner writer for reason-only compatibility routes', async () => {
    const { service, brandStoreConfigReader, brandStoreConfigWriter, uber } =
      setup();

    await service.updateConfig({ reason: ' Updated reason ' });

    expect(brandStoreConfigReader.getStoreSnapshot).toHaveBeenCalledTimes(1);
    expect(brandStoreConfigWriter.updateConfig).toHaveBeenCalledWith({
      brand: undefined,
      store: { temporaryCloseReason: 'Updated reason' },
    });
    expect(uber.syncStoreStatusToUber).toHaveBeenCalledTimes(1);
  });

  it('routes Brand/Store writes to their owner boundary', async () => {
    const { service, brandStoreConfigWriter, uber } = setup();

    await service.updateConfig({
      brandNameEn: ' SanQ Updated ',
      salesTaxRate: 0.14999,
    });

    expect(brandStoreConfigWriter.updateConfig).toHaveBeenCalledWith({
      brand: { brandNameEn: 'SanQ Updated' },
      store: { salesTaxRate: 0.15 },
    });
    expect(uber.syncStoreStatusToUber).not.toHaveBeenCalled();
  });

  it('writes StoreConfig contact and online-order settings through the owner writer', async () => {
    const { service, brandStoreConfigWriter } = setup();

    await service.updateStoreConfig({
      countryCode: ' ca ',
      phone: ' +1 416 555 0100 ',
      contactName: ' Front counter ',
      autoAcceptOnlineOrders: false,
    });

    expect(brandStoreConfigWriter.updateConfig).toHaveBeenCalledWith({
      brand: undefined,
      store: {
        countryCode: 'CA',
        phone: '+1 416 555 0100',
        contactName: 'Front counter',
        autoAcceptOnlineOrders: false,
      },
    });
  });

  it('targets the selected storeStableId when updating StoreConfig', async () => {
    const { service, brandStoreConfigWriter } = setup();

    await service.updateStoreConfig({ salesTaxRate: 0.15 }, 'second_store');

    expect(brandStoreConfigWriter.updateConfig).toHaveBeenCalledWith(
      {
        brand: undefined,
        store: { salesTaxRate: 0.15 },
      },
      'second_store',
    );
  });

  it('rejects Loyalty policy fields through both legacy Admin Business routes', async () => {
    const { service, brandStoreConfigReader, brandStoreConfigWriter } = setup();
    const controller = new AdminBusinessController(service);
    const legacyPayload = { earnPtPerDollar: 0.02 } as never;
    const expectRejected = async (request: Promise<unknown>) => {
      try {
        await request;
        throw new Error('expected Admin Business Loyalty contract rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
        expect((error as Error).message).toContain(
          '/admin/benefits/loyalty-policy',
        );
      }
    };

    await expectRejected(controller.patchConfig(legacyPayload));
    await expectRejected(controller.updateTemporaryClose(legacyPayload));

    expect(brandStoreConfigReader.getStoreSnapshot).not.toHaveBeenCalled();
    expect(brandStoreConfigWriter.updateConfig).not.toHaveBeenCalled();
  });
});
