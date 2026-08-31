import { BrandStoreConfigUnavailableError } from './public-api';
import { PrismaBrandStoreConfigWriter } from './brand-store-config.reader';

const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
const storeStableId = '4750_Yonge_Street';

const brand = {
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
  priorityDefaultDistanceKm: 3,
  latitude: 43.760288,
  longitude: -79.412167,
  addressLine1: '4750 Yonge St.',
  addressLine2: 'Unit 138',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M2N 5M6',
  salesTaxRate: 0.13,
  enableUberDirect: true,
};

function setup(options?: {
  brand?: typeof brand | null;
  config?: typeof storeConfig | null;
}) {
  const tx = {
    brandConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options?.brand === undefined ? brand : options.brand),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...brand,
        ...data,
      })),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue({
        id: storeDbId,
        name: 'SanQ Roujiamo - Yonge',
        config: options?.config === undefined ? storeConfig : options.config,
      }),
    },
    storeConfig: {
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...storeConfig,
        ...data,
      })),
    },
    businessConfig: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
  };

  return {
    tx,
    writer: new PrismaBrandStoreConfigWriter(prisma as never),
  };
}

describe('PrismaBrandStoreConfigWriter', () => {
  it('writes canonical Brand/Store rows first and refreshes the compatibility copy', async () => {
    const { tx, writer } = setup();

    await writer.updateConfig({
      brand: { brandNameEn: 'SanQ Updated' },
      store: {
        isTemporarilyClosed: true,
        temporaryCloseReason: 'Maintenance',
        salesTaxRate: 0.15,
      },
    });

    expect(tx.store.findUnique).toHaveBeenCalledWith({
      where: { storeStableId },
      select: expect.any(Object),
    });
    expect(tx.brandConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { brandNameEn: 'SanQ Updated' },
      select: expect.any(Object),
    });
    expect(tx.storeConfig.update).toHaveBeenCalledWith({
      where: { storeId: storeDbId },
      data: {
        isTemporarilyClosed: true,
        temporaryCloseReason: 'Maintenance',
        salesTaxRate: 0.15,
      },
      select: expect.any(Object),
    });
    expect(tx.businessConfig.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        storeName: 'SanQ Roujiamo - Yonge',
        brandNameEn: 'SanQ Updated',
        isTemporarilyClosed: true,
        temporaryCloseReason: 'Maintenance',
        salesTaxRate: 0.15,
      }),
    });
  });

  it('does not touch BusinessConfig or require BrandConfig for StoreConfig-only canonical fields', async () => {
    const { tx, writer } = setup({ brand: null });

    await writer.updateConfig({
      store: {
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
      },
    });

    expect(tx.storeConfig.update).toHaveBeenCalledWith({
      where: { storeId: storeDbId },
      data: {
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
      },
    });
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect(tx.businessConfig.update).not.toHaveBeenCalled();
  });

  it('fails closed when canonical configuration is not provisioned', async () => {
    const { writer } = setup({ brand: null });

    await expect(
      writer.updateConfig({ store: { salesTaxRate: 0.15 } }),
    ).rejects.toEqual(expect.any(BrandStoreConfigUnavailableError));
  });
});
