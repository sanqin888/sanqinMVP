import { UberValidationError } from '../shared/uber-application.error';
import type { UberMenuPublicationRepositoryPort } from './uber-menu-publication.ports';
import { PublishUberMenuUseCase } from './publish-uber-menu.use-case';

describe('PublishUberMenuUseCase', () => {
  const snapshot = {
    storeId: 'store-1',
    uberStoreId: 'store-1',
    timezone: 'UTC',
    taxRate: 8,
    categories: [
      { stableId: 'cat-1', name: 'Lunch', itemStableIds: ['food-1'] },
    ],
    items: [
      {
        stableId: 'food-1',
        categoryStableId: 'cat-1',
        name: 'Noodles',
        description: null,
        priceCents: 1200,
        sourcePriceCents: 1000,
        overridePriceCents: 1200,
        priceValueSource: 'UBER_OVERRIDE' as const,
        imageUrl: null,
        isAvailable: true,
        modifierGroupStableIds: [],
      },
    ],
    modifierGroups: [],
    modifierOptions: [],
  };
  const setup = () => {
    const provisionedStores = {
      resolveProvisionedUberStoreId: jest
        .fn()
        .mockResolvedValue({ uberStoreId: 'store-1' }),
    };
    const snapshots = {
      loadPublishSnapshot: jest.fn().mockResolvedValue(snapshot),
    };
    const publications = {
      findLastSucceededPayload: jest.fn().mockResolvedValue(null),
      listIntentionalPriceRestores: jest.fn().mockResolvedValue(new Set()),
      recordCriticalRiskAcknowledgement: jest.fn(),
      findSucceededAttempt: jest.fn().mockResolvedValue(null),
      createAttempt: jest.fn().mockResolvedValue({
        attemptId: 'attempt-1',
        storeId: 'store-1',
        idempotencyKey: 'key',
        businessVersion: 'version-1',
        status: 'CREATED',
        uberRequestId: null,
        uberResourceId: null,
      }),
      markSubmitted: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
      claimDueConfirmations: jest.fn(),
      markConfirmed: jest.fn(),
    };
    const gateway = {
      uploadMenu: jest.fn().mockResolvedValue({
        uberRequestId: 'request-1',
        uberResourceId: 'resource-1',
      }),
      getMenuPublicationStatus: jest.fn(),
    };
    const images = {
      validateImages: jest
        .fn()
        .mockResolvedValue({ valid: true, failures: [] }),
    };
    return {
      useCase: new PublishUberMenuUseCase(
        provisionedStores,
        snapshots,
        publications as unknown as UberMenuPublicationRepositoryPort,
        gateway,
        images,
        { publicBaseUrl: 'https://menu.example/' },
      ),
      snapshots,
      publications,
      gateway,
      images,
      provisionedStores,
    };
  };

  it('先将 POS store id 解析为 Uber store id，再调用 snapshot adapter', async () => {
    const x = setup();
    await x.useCase.execute({ storeId: 'pos-room-1', dryRun: true });
    expect(
      x.provisionedStores.resolveProvisionedUberStoreId,
    ).toHaveBeenCalledWith('pos-room-1');
    expect(x.snapshots.loadPublishSnapshot).toHaveBeenCalledWith(
      'pos-room-1',
      'store-1',
    );
  });

  it('POS store id 没有 provisioned mapping 时抛出应用错误', async () => {
    const x = setup();
    x.provisionedStores.resolveProvisionedUberStoreId.mockResolvedValue(null);
    await expect(
      x.useCase.execute({ storeId: 'missing-pos-store', dryRun: true }),
    ).rejects.toMatchObject({ code: 'UBER_STORE_NOT_PROVISIONED' });
    expect(x.snapshots.loadPublishSnapshot).not.toHaveBeenCalled();
  });

  it('dry-run 只构建 payload，不创建发布尝试', async () => {
    const x = setup();
    await expect(
      x.useCase.execute({ storeId: 'store-1', dryRun: true }),
    ).resolves.toMatchObject({ ok: true, dryRun: true });
    expect(x.publications.createAttempt).not.toHaveBeenCalled();
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();
  });

  it('uses the outgoing hashed option id to detect option price fallback', async () => {
    const x = setup();
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: snapshot.items.map((item) => ({
        ...item,
        modifierGroupStableIds: ['extras'],
      })),
      modifierGroups: [
        {
          stableId: 'extras',
          name: 'Extras',
          minSelect: 0,
          maxSelect: 1,
          optionStableIds: ['extra-cheese'],
        },
      ],
      modifierOptions: [
        {
          stableId: 'extra-cheese',
          name: 'Extra cheese',
          priceDeltaCents: 50,
          sourcePriceDeltaCents: 50,
          overridePriceDeltaCents: null,
          priceValueSource: 'SANQ_SOURCE' as const,
          isAvailable: true,
          childGroupStableIds: [],
        },
      ],
    });
    const initial = (await x.useCase.execute({
      storeId: 'store-1',
      dryRun: true,
    })) as {
      payload: {
        items: Array<{
          title: { translations: { en_us: string } };
          price_info: { price: number };
        }>;
      };
    };
    const previous = structuredClone(initial.payload);
    const publishedOption = previous.items.find(
      (item) => item.title.translations.en_us === 'Extra cheese',
    );
    expect(publishedOption).toBeDefined();
    publishedOption!.price_info.price = 150;
    x.publications.findLastSucceededPayload.mockResolvedValue(previous);

    await expect(
      x.useCase.execute({ storeId: 'store-1', dryRun: true }),
    ).resolves.toMatchObject({
      safety: {
        risks: [
          expect.objectContaining({
            severity: 'CRITICAL',
            code: 'PUBLISHED_OVERRIDE_FALLBACK',
            entityType: 'OPTION_ITEM',
            entityId: 'extra-cheese',
            field: 'priceDelta',
            previousValue: 150,
            currentValue: 50,
          }),
        ],
      },
    });
  });

  it('CRITICAL override fallback 阻断普通发布，显式 MFA 确认后允许', async () => {
    const x = setup();
    const dryRun = (await x.useCase.execute({
      storeId: 'store-1',
      dryRun: true,
    })) as {
      payload: { items: Array<{ price_info: { price: number } }> };
      safety: { fingerprint: string };
    };
    const previous = structuredClone(dryRun.payload);
    previous.items[0].price_info.price = 1300;
    x.publications.findLastSucceededPayload.mockResolvedValue(previous);
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: snapshot.items.map((item) => ({
        ...item,
        priceCents: 1200,
        sourcePriceCents: 1200,
        overridePriceCents: null,
        priceValueSource: 'SANQ_SOURCE' as const,
      })),
    });

    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_CRITICAL_RISK_CONFIRMATION_REQUIRED',
    });
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();

    await expect(
      x.useCase.execute({
        storeId: 'store-1',
        taxRateConfirmed: true,
        safetyFingerprint: dryRun.safety.fingerprint,
      }),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_CRITICAL_RISK_CONFIRMATION_REQUIRED',
    });

    const reviewed = (await x.useCase.execute({
      storeId: 'store-1',
      dryRun: true,
    })) as { safety: { fingerprint: string } };
    await expect(
      x.useCase.execute({
        storeId: 'store-1',
        taxRateConfirmed: true,
        safetyFingerprint: reviewed.safety.fingerprint,
      }),
    ).resolves.toMatchObject({ ok: true, dryRun: false });
    expect(
      x.publications.recordCriticalRiskAcknowledgement,
    ).toHaveBeenCalledTimes(1);
  });

  it('重复的成功发布直接返回，不再次上传', async () => {
    const x = setup();
    x.publications.findSucceededAttempt.mockResolvedValue({
      attemptId: 'old',
      businessVersion: 'old-version',
    } as any);
    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).resolves.toMatchObject({ duplicate: true });
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();
  });

  it('上传成功后标记 SUBMITTED', async () => {
    const x = setup();
    await x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true });
    expect(x.publications.markSubmitted).toHaveBeenCalledWith('attempt-1', {
      uberRequestId: 'request-1',
      uberResourceId: 'resource-1',
    });
  });

  it('将网络上传失败标为可重试', async () => {
    const x = setup();
    x.gateway.uploadMenu.mockRejectedValue(new Error('timeout'));
    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).rejects.toThrow('timeout');
    expect(x.publications.markFailed).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ retryable: true }),
    );
  });

  it('不可重试的 payload 校验失败不会创建尝试', async () => {
    const x = setup();
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      categories: [],
    });
    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).rejects.toBeInstanceOf(UberValidationError);
    expect(x.publications.createAttempt).not.toHaveBeenCalled();
  });

  it('图片探测失败会阻止发布', async () => {
    const x = setup();
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: [
        { ...snapshot.items[0], imageUrl: 'https://cdn.example/image.jpg' },
      ],
    });
    x.images.validateImages.mockResolvedValue({
      valid: false,
      failures: [
        {
          itemStableId: 'food-1',
          url: 'https://cdn.example/image.jpg',
          code: 'INVALID_IMAGE',
          message: 'bad image',
        },
      ],
    });
    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).rejects.toBeInstanceOf(UberValidationError);
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();
  });

  it('将相对图片路径解析后再交给图片探测器', async () => {
    const x = setup();
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: [{ ...snapshot.items[0], imageUrl: '/images/noodles.jpg' }],
    });
    await x.useCase.execute({ storeId: 'store-1', dryRun: true });
    expect(x.images.validateImages).toHaveBeenCalledWith([
      {
        itemStableId: 'food-1',
        url: 'https://menu.example/images/noodles.jpg',
      },
    ]);
  });
});
