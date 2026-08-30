import { BrandStoreConfigUnavailableError } from './public-api';
import { PrismaBrandStoreConfigReader } from './brand-store-config.reader';

const brandConfig = {
  brandNameZh: '三秦肉夹馍',
  brandNameEn: 'SanQ Roujiamo',
  siteUrl: 'https://sanq.ca',
  emailFromNameZh: '三秦肉夹馍',
  emailFromNameEn: 'SanQ Roujiamo',
  emailFromAddress: 'no-reply@sanq.ca',
  smsSignature: 'SanQ',
  supportPhone: '+1 437-808-6888',
  supportEmail: 'support@sanq.ca',
  wechatAlipayExchangeRate: 5.15,
};

const storeConfig = {
  timezone: 'America/Toronto',
  isTemporarilyClosed: false,
  temporaryCloseReason: null,
  publicNotice: null,
  publicNoticeEn: null,
  deliveryBaseFeeCents: 600,
  priorityPerKmCents: 100,
  maxDeliveryRangeKm: 10,
  priorityDefaultDistanceKm: 6,
  latitude: 43.760288,
  longitude: -79.412167,
  addressLine1: '4750 Yonge St.',
  addressLine2: 'Unit 138',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M2N 5M6',
  countryCode: 'CA',
  phone: '+1 437-808-6888',
  contactName: 'San Qin',
  salesTaxRate: 0.13,
  enableUberDirect: true,
  autoAcceptOnlineOrders: true,
  allergyHandlingMode: 'RELAY_ALL' as const,
  unsupportedAllergens: [],
};

function setup(input?: {
  brand?: typeof brandConfig | null;
  store?: {
    storeStableId: string;
    name: string;
    isActive: boolean;
    config: typeof storeConfig | null;
  } | null;
}) {
  const resolvedBrand =
    input && Object.prototype.hasOwnProperty.call(input, 'brand')
      ? input.brand
      : brandConfig;
  const resolvedStore =
    input && Object.prototype.hasOwnProperty.call(input, 'store')
      ? input.store
      : {
          storeStableId: '4750_Yonge_Street',
          name: '4750 Yonge St.',
          isActive: true,
          config: storeConfig,
        };
  const prisma = {
    brandConfig: {
      findUnique: jest.fn().mockResolvedValue(resolvedBrand),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue(resolvedStore),
    },
  };
  return {
    prisma,
    reader: new PrismaBrandStoreConfigReader(prisma as never),
  };
}

describe('PrismaBrandStoreConfigReader', () => {
  it('reads the canonical brand and configured store snapshots without legacy BusinessConfig', async () => {
    const { prisma, reader } = setup();

    await expect(reader.getSnapshot()).resolves.toEqual({
      brand: brandConfig,
      store: {
        storeStableId: '4750_Yonge_Street',
        storeName: '4750 Yonge St.',
        isActive: true,
        ...storeConfig,
      },
    });

    expect(prisma.brandConfig.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        brandNameZh: true,
        brandNameEn: true,
        siteUrl: true,
        emailFromNameZh: true,
        emailFromNameEn: true,
        emailFromAddress: true,
        smsSignature: true,
        supportPhone: true,
        supportEmail: true,
        wechatAlipayExchangeRate: true,
      },
    });
    expect(prisma.store.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeStableId: '4750_Yonge_Street' },
      }),
    );
    expect('businessConfig' in prisma).toBe(false);
  });

  it('reads StoreConfig independently from BrandConfig for store-only consumers', async () => {
    const { prisma, reader } = setup({ brand: null });

    await expect(reader.getStoreSnapshot()).resolves.toMatchObject({
      storeStableId: '4750_Yonge_Street',
      timezone: 'America/Toronto',
    });
    expect(prisma.brandConfig.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when BrandConfig is not provisioned instead of creating defaults', async () => {
    const { reader } = setup({ brand: null });

    await expect(reader.getSnapshot()).rejects.toEqual(
      expect.any(BrandStoreConfigUnavailableError),
    );
  });

  it('fails closed when the configured Store is not provisioned', async () => {
    const { reader } = setup({ store: null });

    await expect(reader.getSnapshot()).rejects.toThrow(
      'Configured store 4750_Yonge_Street is not provisioned',
    );
  });

  it('fails closed when the configured StoreConfig is not provisioned', async () => {
    const { reader } = setup({
      store: {
        storeStableId: '4750_Yonge_Street',
        name: '4750 Yonge St.',
        isActive: true,
        config: null,
      },
    });

    await expect(reader.getSnapshot()).rejects.toThrow(
      'StoreConfig for 4750_Yonge_Street is not provisioned',
    );
  });
});
