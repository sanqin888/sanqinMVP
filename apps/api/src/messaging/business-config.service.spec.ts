import { BusinessConfigService } from './business-config.service';

const canonicalSnapshot = {
  brand: {
    brandNameZh: '三秦肉夹馍',
    brandNameEn: 'SanQ Roujiamo',
    siteUrl: 'https://sanq.ca',
    emailFromNameZh: '三秦肉夹馍',
    emailFromNameEn: 'SanQ Roujiamo',
    emailFromAddress: 'no-reply@sanq.ca',
    smsSignature: '【SanQ】',
    supportPhone: '+1 416 BRAND',
    supportEmail: 'support@sanq.ca',
    wechatAlipayExchangeRate: 5.15,
  },
  store: {
    storeStableId: '4750_Yonge_Street',
    storeName: 'SanQ Yonge',
    timezone: 'America/Toronto',
    addressLine1: 'Unit 138-4750 Yonge St',
    addressLine2: null,
    city: 'North York',
    province: 'ON',
    postalCode: 'M2N 0H8',
    phone: '+1 416 STORE',
  },
};

function setup() {
  const brandStoreConfigReader = {
    getBrandSnapshot: jest.fn().mockResolvedValue(canonicalSnapshot.brand),
    getConfiguredStoreSnapshot: jest
      .fn()
      .mockResolvedValue(canonicalSnapshot.store),
  };
  const service = new BusinessConfigService(brandStoreConfigReader as never);
  return { service, brandStoreConfigReader };
}

describe('BusinessConfigService canonical Brand/Store configuration', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps brand messaging fields and store invoice contact fields without mixing phone ownership', async () => {
    const { service, brandStoreConfigReader } = setup();

    await expect(service.getMessagingSnapshot('zh')).resolves.toEqual({
      baseVars: {
        brandName: '三秦肉夹馍',
        siteUrl: 'https://sanq.ca',
        supportEmail: 'support@sanq.ca',
        supportPhone: '+1 416 BRAND',
        storeAddressLine: '门店地址：Unit 138-4750 Yonge St, North York',
        smsSignature: '【SanQ】',
      },
      emailFromName: '三秦肉夹馍',
      emailFromAddress: 'no-reply@sanq.ca',
      smsSignature: '【SanQ】',
      store: {
        name: 'SanQ Yonge',
        address: 'Unit 138-4750 Yonge St, North York, ON, M2N 0H8',
        phone: '+1 416 STORE',
      },
    });

    expect(brandStoreConfigReader.getBrandSnapshot).toHaveBeenCalledTimes(1);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
  });

  it('preserves the existing messaging defaults when canonical optional fields are empty', async () => {
    const brandStoreConfigReader = {
      getBrandSnapshot: jest.fn().mockResolvedValue({
        brandNameZh: null,
        brandNameEn: '   ',
        siteUrl: null,
        emailFromNameZh: null,
        emailFromNameEn: null,
        emailFromAddress: null,
        smsSignature: null,
        supportPhone: null,
        supportEmail: null,
      }),
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeName: '   ',
        addressLine1: null,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        phone: null,
      }),
    };
    const service = new BusinessConfigService(brandStoreConfigReader as never);

    await expect(service.getMessagingSnapshot('en')).resolves.toEqual({
      baseVars: {
        brandName: 'San Qin Roujiamo',
        siteUrl: 'https://sanq.ca',
        supportEmail: 'support@sanq.ca',
        supportPhone: undefined,
        storeAddressLine: 'Store Address：Unit 138-4750 Yonge St, North York.',
        smsSignature: '【三秦肉夹馍（San Qin）】',
      },
      emailFromName: 'San Qin Rougamo',
      emailFromAddress: 'no-reply@sanq.ca',
      smsSignature: '【三秦肉夹馍（San Qin）】',
      store: {
        name: 'San Qin Roujiamo',
        address: 'Unit 138-4750 Yonge St, North York',
        phone: undefined,
      },
    });
  });

  it('keeps the canonical snapshot cached for five minutes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T20:00:00.000Z'));
    const { service, brandStoreConfigReader } = setup();

    await service.getMessagingSnapshot('en');
    jest.setSystemTime(new Date('2026-08-30T20:04:59.000Z'));
    await service.getMessagingSnapshot('zh');

    expect(brandStoreConfigReader.getBrandSnapshot).toHaveBeenCalledTimes(1);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-08-30T20:05:01.000Z'));
    await service.getMessagingSnapshot('en');

    expect(brandStoreConfigReader.getBrandSnapshot).toHaveBeenCalledTimes(2);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(2);
  });

  it('fails closed when canonical Brand/Store configuration is unavailable', async () => {
    const brandStoreConfigReader = {
      getBrandSnapshot: jest
        .fn()
        .mockRejectedValue(new Error('canonical config missing')),
      getConfiguredStoreSnapshot: jest
        .fn()
        .mockResolvedValue(canonicalSnapshot.store),
    };
    const service = new BusinessConfigService(brandStoreConfigReader as never);

    await expect(service.getMessagingSnapshot('en')).rejects.toThrow(
      'canonical config missing',
    );
    expect(brandStoreConfigReader.getBrandSnapshot).toHaveBeenCalledTimes(1);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
  });
});
