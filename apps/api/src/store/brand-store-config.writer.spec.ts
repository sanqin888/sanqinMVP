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

type BrandRow = typeof brand;
type StoreConfigRow = typeof storeConfig;
type StoreUpdateData = Partial<StoreConfigRow> & {
  allergyHandlingMode?: string;
  unsupportedAllergens?: string[];
};
type SelectShape = Record<string, boolean>;

function setup(options?: {
  brand?: BrandRow | null;
  config?: StoreConfigRow | null;
  casCount?: number;
}) {
  const brandFindUnique = jest.fn(
    (args: { where: { id: number }; select: SelectShape }) => {
      void args;
      return Promise.resolve(
        options?.brand === undefined ? brand : options.brand,
      );
    },
  );
  const brandUpdate = jest.fn(
    (args: {
      where: { id: number };
      data: Partial<BrandRow>;
      select: SelectShape;
    }) => Promise.resolve({ ...brand, ...args.data }),
  );
  const storeFindUnique = jest.fn(
    (args: { where: { storeStableId: string }; select: SelectShape }) => {
      void args;
      return Promise.resolve({
        id: storeDbId,
        name: 'SanQ Roujiamo - Yonge',
        config: options?.config === undefined ? storeConfig : options.config,
      });
    },
  );
  const storeUpdate = jest.fn(
    (args: {
      where: { storeId: string };
      data: StoreUpdateData;
      select?: SelectShape;
    }) => Promise.resolve({ ...storeConfig, ...args.data }),
  );
  const storeUpdateMany = jest.fn().mockResolvedValue({
    count: options?.casCount ?? 1,
  });
  const storeConfigFindUnique = jest.fn().mockResolvedValue({
    ...(options?.config ?? storeConfig),
    isTemporarilyClosed: false,
    temporaryCloseReason: null,
  });
  const businessUpdate = jest.fn(
    (args: { where: { id: number }; data: Record<string, unknown> }) => {
      void args;
      return Promise.resolve({});
    },
  );

  const tx = {
    brandConfig: {
      findUnique: brandFindUnique,
      update: brandUpdate,
    },
    store: {
      findUnique: storeFindUnique,
    },
    storeConfig: {
      findUnique: storeConfigFindUnique,
      update: storeUpdate,
      updateMany: storeUpdateMany,
    },
    businessConfig: {
      update: businessUpdate,
    },
  };
  const transaction = jest.fn(
    (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  const prisma = {
    $transaction: transaction,
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

    expect(tx.store.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.store.findUnique.mock.calls[0]?.[0].where).toEqual({
      storeStableId,
    });
    expect(tx.brandConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.brandConfig.update.mock.calls[0]?.[0].data).toEqual({
      brandNameEn: 'SanQ Updated',
    });
    expect(tx.storeConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.storeConfig.update.mock.calls[0]?.[0].data).toEqual({
      isTemporarilyClosed: true,
      temporaryCloseReason: 'Maintenance',
      salesTaxRate: 0.15,
    });
    expect(tx.businessConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.businessConfig.update.mock.calls[0]?.[0].data).toMatchObject({
      storeName: 'SanQ Roujiamo - Yonge',
      brandNameEn: 'SanQ Updated',
      isTemporarilyClosed: true,
      temporaryCloseReason: 'Maintenance',
      salesTaxRate: 0.15,
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

    expect(tx.storeConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.storeConfig.update.mock.calls[0]?.[0]).toEqual({
      where: { storeId: storeDbId },
      data: {
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
      },
    });
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect(tx.businessConfig.update).not.toHaveBeenCalled();
  });

  it('atomically resumes only the matching canonical temporary closure and refreshes compatibility', async () => {
    const pauseReason = '__AUTO_UNTIL__:2026-08-25T08:30:00-04:00|';
    const { tx, writer } = setup({
      config: {
        ...storeConfig,
        isTemporarilyClosed: true,
        temporaryCloseReason: pauseReason,
      },
    });

    await expect(
      writer.resumeTemporaryClosureIfMatches(pauseReason),
    ).resolves.toBe(true);

    expect(tx.storeConfig.updateMany).toHaveBeenCalledWith({
      where: {
        storeId: storeDbId,
        isTemporarilyClosed: true,
        temporaryCloseReason: pauseReason,
      },
      data: {
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
      },
    });
    expect(tx.businessConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.businessConfig.update.mock.calls[0]?.[0].data).toMatchObject({
      isTemporarilyClosed: false,
      temporaryCloseReason: null,
    });
  });

  it('preserves a changed pause when the canonical compare-and-set no longer matches', async () => {
    const pauseReason = '__AUTO_UNTIL__:2026-08-25T08:30:00-04:00|';
    const { tx, writer } = setup({ casCount: 0 });

    await expect(
      writer.resumeTemporaryClosureIfMatches(pauseReason),
    ).resolves.toBe(false);

    expect(tx.storeConfig.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect(tx.storeConfig.findUnique).not.toHaveBeenCalled();
    expect(tx.businessConfig.update).not.toHaveBeenCalled();
  });

  it('fails closed when canonical configuration is not provisioned', async () => {
    const { writer } = setup({ brand: null });

    await expect(
      writer.updateConfig({ store: { salesTaxRate: 0.15 } }),
    ).rejects.toEqual(expect.any(BrandStoreConfigUnavailableError));
  });
});
