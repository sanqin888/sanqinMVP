import {
  BrandStoreConfigUnavailableError,
  StoreStableIdAlreadyExistsError,
} from './public-api';
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
  countryCode: 'CA',
  phone: '+1-437-808-6888',
  contactName: 'San Qin',
  salesTaxRate: 0.13,
  enableUberDirect: true,
  autoAcceptOnlineOrders: true,
  allergyHandlingMode: 'RELAY_ALL',
  unsupportedAllergens: [] as string[],
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
  duplicateStoreStableId?: string | null;
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
  const storeFindFirst = jest
    .fn()
    .mockResolvedValue(
      options?.duplicateStoreStableId
        ? { storeStableId: options.duplicateStoreStableId }
        : null,
    );
  const storeCreate = jest.fn(
    (args: {
      data: {
        storeStableId: string;
        name: string;
        config?: { create: Record<string, never> };
        businessHours?: { create: Array<Record<string, unknown>> };
      };
      select?: SelectShape;
    }) =>
      Promise.resolve({
        storeStableId: args.data.storeStableId,
        name: args.data.name,
        isActive: true,
        config: storeConfig,
      }),
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
  const tx = {
    brandConfig: {
      findUnique: brandFindUnique,
      update: brandUpdate,
    },
    store: {
      findUnique: storeFindUnique,
      findFirst: storeFindFirst,
      create: storeCreate,
    },
    storeConfig: {
      update: storeUpdate,
      updateMany: storeUpdateMany,
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
  it('writes canonical Brand/Store rows without a BusinessConfig delegate', async () => {
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
    expect('businessConfig' in tx).toBe(false);
  });

  it('does not touch BusinessConfig or require BrandConfig for StoreConfig-only canonical fields', async () => {
    const { tx, writer } = setup({ brand: null });

    await writer.updateConfig({
      store: {
        phone: '+1 416 555 0100',
        contactName: 'Front counter',
        countryCode: 'CA',
        autoAcceptOnlineOrders: false,
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
      },
    });

    expect(tx.storeConfig.update).toHaveBeenCalledTimes(1);
    expect(tx.storeConfig.update.mock.calls[0]?.[0]).toEqual({
      where: { storeId: storeDbId },
      data: {
        phone: '+1 416 555 0100',
        contactName: 'Front counter',
        countryCode: 'CA',
        autoAcceptOnlineOrders: false,
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
      },
    });
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
  });

  it('writes a non-default StoreConfig without consulting BrandConfig', async () => {
    const { tx, writer } = setup();

    await writer.updateConfig(
      { store: { salesTaxRate: 0.15 } },
      'second_store',
    );

    expect(tx.store.findUnique.mock.calls[0]?.[0].where).toEqual({
      storeStableId: 'second_store',
    });
    expect(tx.storeConfig.update).toHaveBeenCalledWith({
      where: { storeId: storeDbId },
      data: { salesTaxRate: 0.15 },
    });
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
  });

  it('provisions a new Store with StoreConfig and seven closed business days', async () => {
    const { tx, writer } = setup();

    await expect(
      writer.createStore({
        storeStableId: 'second_store',
        storeName: 'Second Store',
      }),
    ).resolves.toMatchObject({
      storeStableId: 'second_store',
      storeName: 'Second Store',
      isActive: true,
    });

    expect(tx.store.findFirst).toHaveBeenCalledWith({
      where: {
        storeStableId: { equals: 'second_store', mode: 'insensitive' },
      },
      select: { storeStableId: true },
    });
    const createArgs = tx.store.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({
      storeStableId: 'second_store',
      name: 'Second Store',
      config: { create: {} },
    });
    expect(createArgs?.data.businessHours?.create).toHaveLength(7);
    expect(createArgs?.data.businessHours?.create).toEqual(
      expect.arrayContaining([
        { weekday: 0, isClosed: true, openMinutes: null, closeMinutes: null },
        { weekday: 6, isClosed: true, openMinutes: null, closeMinutes: null },
      ]),
    );
  });

  it('rejects a duplicate Store stable id before insert', async () => {
    const { tx, writer } = setup({ duplicateStoreStableId: 'SECOND_STORE' });

    await expect(
      writer.createStore({
        storeStableId: 'second_store',
        storeName: 'Second Store',
      }),
    ).rejects.toEqual(expect.any(StoreStableIdAlreadyExistsError));

    expect(tx.store.create).not.toHaveBeenCalled();
  });

  it('atomically resumes only the matching canonical temporary closure without legacy persistence', async () => {
    const pauseReason = '__AUTO_UNTIL__:2026-08-25T08:30:00-04:00|';
    const { tx, writer } = setup({
      config: {
        ...storeConfig,
        isTemporarilyClosed: true,
        temporaryCloseReason: pauseReason,
      },
    });

    await expect(
      writer.resumeTemporaryClosureIfMatches(storeStableId, pauseReason),
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
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
  });

  it('supports non-default StoreConfig auto-resume through the same canonical CAS', async () => {
    const pauseReason = '__AUTO_UNTIL__:2026-08-25T08:30:00-04:00|';
    const { tx, writer } = setup({
      config: {
        ...storeConfig,
        isTemporarilyClosed: true,
        temporaryCloseReason: pauseReason,
      },
    });

    await expect(
      writer.resumeTemporaryClosureIfMatches('second_store', pauseReason),
    ).resolves.toBe(true);

    expect(tx.store.findUnique.mock.calls[0]?.[0].where).toEqual({
      storeStableId: 'second_store',
    });
    expect(tx.storeConfig.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
  });

  it('preserves a changed pause when the canonical compare-and-set no longer matches', async () => {
    const pauseReason = '__AUTO_UNTIL__:2026-08-25T08:30:00-04:00|';
    const { tx, writer } = setup({ casCount: 0 });

    await expect(
      writer.resumeTemporaryClosureIfMatches(storeStableId, pauseReason),
    ).resolves.toBe(false);

    expect(tx.storeConfig.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.brandConfig.findUnique).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
  });

  it('fails closed when the target StoreConfig is not provisioned', async () => {
    const { writer } = setup({ config: null });

    await expect(
      writer.updateConfig({ store: { salesTaxRate: 0.15 } }),
    ).rejects.toEqual(expect.any(BrandStoreConfigUnavailableError));
  });

  it('fails closed when BrandConfig is not provisioned for a brand update', async () => {
    const { writer } = setup({ brand: null });

    await expect(
      writer.updateConfig({ brand: { brandNameEn: 'SanQ Updated' } }),
    ).rejects.toEqual(expect.any(BrandStoreConfigUnavailableError));
  });
});
