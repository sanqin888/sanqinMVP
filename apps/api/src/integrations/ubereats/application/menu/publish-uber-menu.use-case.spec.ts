import { UberValidationError } from '../shared/uber-application.error';
import type { UberMenuPublicationRepositoryPort } from './uber-menu-publication.ports';

type PublishedMenuPayload = NonNullable<
  Awaited<
    ReturnType<UberMenuPublicationRepositoryPort['findLastSucceededPayload']>
  >
>;
import {
  PublishUberMenuUseCase,
  RetrieveAndReconcileUberMenuUseCase,
} from './publish-uber-menu.use-case';

describe('PublishUberMenuUseCase', () => {
  const snapshot = {
    storeId: 'pos-room-1',
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
        suspendUntilEpochSeconds: null,
        preparationType: 'PREPARED' as const,
        modifierGroupStableIds: [],
      },
    ],
    modifierGroups: [],
    modifierOptions: [],
  };
  const setup = () => {
    const provisionedStores = {
      resolveProvisionedUberStoreId: jest.fn().mockResolvedValue({
        uberStoreId: 'store-1',
        posExternalStoreId: 'pos-room-1',
      }),
    };
    const snapshots = {
      loadPublishSnapshot: jest.fn().mockResolvedValue(snapshot),
    };
    const publications = {
      findLastSucceededPayload: jest.fn().mockResolvedValue(null),
      listIntentionalPriceRestores: jest.fn().mockResolvedValue(new Set()),
      recordCriticalRiskAcknowledgement: jest.fn(),
      markPublishVersionSucceeded: jest.fn().mockResolvedValue(undefined),
      markPublishVersionFailed: jest.fn().mockResolvedValue(undefined),
      findSucceededAttempt: jest.fn().mockResolvedValue(null),
      createAttempt: jest.fn().mockResolvedValue({
        attemptId: 'attempt-1',
        storeId: 'pos-room-1',
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
      uploadMenu: jest.fn().mockResolvedValue(undefined),
      updateItemAvailability: jest.fn(),
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

  type UploadedPayload = {
    items: Array<{
      title: { translations: { en_us: string } };
      price_info: { price: number };
      suspension_info: null | {
        suspension: { suspend_until: number; reason: string };
      };
    }>;
  };

  const lastUploadedPayload = (
    gateway: ReturnType<typeof setup>['gateway'],
  ): UploadedPayload => {
    const calls = gateway.uploadMenu.mock.calls as unknown as Array<
      [{ payload: UploadedPayload }]
    >;
    const request = calls.at(-1)?.[0];
    if (!request) throw new Error('Expected an Uber menu upload call.');
    return request.payload;
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

  it('兼容 Uber store id 调用并归一到 POS store scope', async () => {
    const x = setup();
    await expect(
      x.useCase.execute({ storeId: 'store-1', dryRun: true }),
    ).resolves.toMatchObject({
      storeId: 'pos-room-1',
      uberStoreId: 'store-1',
    });
    expect(
      x.provisionedStores.resolveProvisionedUberStoreId,
    ).toHaveBeenCalledWith('store-1');
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

  it('未明确 preparationType 时在发送 Uber 前阻断发布', async () => {
    const x = setup();
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: snapshot.items.map((item) => ({
        ...item,
        preparationType: null,
      })),
    });

    await expect(
      x.useCase.execute({ storeId: 'store-1', dryRun: true }),
    ).rejects.toMatchObject({ code: 'UBER_PREPARATION_TYPE_REQUIRED' });
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();
    expect(x.publications.createAttempt).not.toHaveBeenCalled();
  });

  it('dry-run 构建并校验 publish graph，但不暴露 payload 或创建发布尝试', async () => {
    const x = setup();
    const result = await x.useCase.execute({
      storeId: 'store-1',
      dryRun: true,
    });
    expect(result).toMatchObject({ ok: true, dryRun: true });
    expect(result).not.toHaveProperty('payload');
    expect(x.publications.createAttempt).not.toHaveBeenCalled();
    expect(x.gateway.uploadMenu).not.toHaveBeenCalled();
  });

  it('full publish preserves a temporary sold-out suspend_until instead of making it indefinite', async () => {
    const x = setup();
    const suspendUntilEpochSeconds = 3786995045;
    x.snapshots.loadPublishSnapshot.mockResolvedValue({
      ...snapshot,
      items: snapshot.items.map((item) => ({
        ...item,
        isAvailable: false,
        suspendUntilEpochSeconds,
      })),
    });

    await x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true });

    expect(lastUploadedPayload(x.gateway).items[0]?.suspension_info).toEqual({
      suspension: {
        suspend_until: suspendUntilEpochSeconds,
        reason: 'Item unavailable',
      },
    });
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
          suspendUntilEpochSeconds: null,
          preparationType: 'PREPARED' as const,
          childGroupStableIds: [],
        },
      ],
    });
    await x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true });
    const previous = structuredClone(lastUploadedPayload(x.gateway));
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
    const staleReview = (await x.useCase.execute({
      storeId: 'store-1',
      dryRun: true,
    })) as { safety: { fingerprint: string } };
    await x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true });
    const previous = structuredClone(lastUploadedPayload(x.gateway));
    previous.items[0].price_info.price = 1300;
    x.gateway.uploadMenu.mockClear();
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
        safetyFingerprint: staleReview.safety.fingerprint,
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

  it('上传 204 成功后直接标记 SUCCEEDED', async () => {
    const x = setup();
    await x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true });
    expect(x.publications.markPublishVersionSucceeded).toHaveBeenCalledWith(
      'attempt-1',
      { status_code: 204 },
    );
    expect(x.publications.markSubmitted).not.toHaveBeenCalled();
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

  it('将 Uber HTTP 400 诊断持久化并标记为不可重试', async () => {
    const x = setup();
    x.gateway.uploadMenu.mockRejectedValue(
      new UberValidationError({
        code: 'UBER_INVALID_MENU',
        message: 'Uber API 请求失败',
        operation: 'uber.menu.upload',
        upstreamStatus: 400,
        upstreamDetail: 'category cat-1 has no items',
      }),
    );

    await expect(
      x.useCase.execute({ storeId: 'store-1', taxRateConfirmed: true }),
    ).rejects.toMatchObject({
      code: 'UBER_INVALID_MENU',
      retryable: false,
      upstreamStatus: 400,
    });
    expect(x.publications.markFailed).toHaveBeenCalledWith('attempt-1', {
      errorCode: 'UBER_INVALID_MENU',
      errorMessage: 'Uber API 请求失败',
      retryable: false,
      upstreamStatus: 400,
      upstreamDetail: 'category cat-1 has no items',
    });
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

describe('RetrieveAndReconcileUberMenuUseCase', () => {
  const baseline: PublishedMenuPayload = {
    display_options: { disable_item_instructions: false },
    menus: [
      {
        id: 'menu-1',
        title: { translations: { en_us: 'Main Menu' } },
        category_ids: ['cat-1'],
        service_availability: [],
      },
    ],
    categories: [
      {
        id: 'cat-1',
        title: { translations: { en_us: 'Main' } },
        entities: [{ id: 'item-1', type: 'ITEM' }],
      },
    ],
    items: [
      {
        id: 'item-1',
        title: { translations: { en_us: 'Roujiamo' } },
        price_info: { price: 749, overrides: [] },
        tax_info: { tax_rate: 13, vat_rate_percentage: null },
        dish_info: { classifications: {} },
        modifier_group_ids: { ids: ['group-1'], overrides: [] },
        suspension_info: null,
      },
      {
        id: 'option-1',
        title: { translations: { en_us: 'Extra' } },
        price_info: { price: 100, overrides: [] },
        tax_info: { tax_rate: 13, vat_rate_percentage: null },
        dish_info: { classifications: {} },
        modifier_group_ids: { ids: null, overrides: [] },
        suspension_info: null,
      },
    ],
    modifier_groups: [
      {
        id: 'group-1',
        title: { translations: { en_us: 'Extras' } },
        quantity_info: { quantity: { min_permitted: 0, max_permitted: 1 } },
        modifier_options: [{ id: 'option-1', type: 'ITEM' }],
      },
    ],
  };
  const remote = {
    storeId: 'uber-store-1',
    menuIds: ['menu-1'],
    categoryIds: ['cat-1'],
    items: [
      {
        id: 'item-1',
        priceCents: 749,
        isAvailable: true,
        modifierGroupIds: ['group-1'],
        taxRatePercentage: 13,
        taxLabels: [],
        preparationType: null,
      },
      {
        id: 'option-1',
        priceCents: 100,
        isAvailable: true,
        modifierGroupIds: [],
        taxRatePercentage: 13,
        taxLabels: [],
        preparationType: null,
      },
    ],
    modifierGroups: [{ id: 'group-1', optionItemIds: ['option-1'] }],
    disableItemInstructions: null,
  };
  const setupReconciliation = (
    retrieved = remote,
    published: PublishedMenuPayload | null = baseline,
  ) => {
    const provisionedStores = {
      resolveProvisionedUberStoreId: jest.fn().mockResolvedValue({
        posExternalStoreId: 'pos-store-1',
        uberStoreId: 'uber-store-1',
      }),
    };
    const publications = {
      findLastSucceededPayload: jest.fn().mockResolvedValue(published),
    };
    const gateway = { retrieveMenu: jest.fn().mockResolvedValue(retrieved) };
    return {
      provisionedStores,
      publications,
      gateway,
      useCase: new RetrieveAndReconcileUberMenuUseCase(
        provisionedStores as never,
        publications as never,
        gateway as never,
      ),
    };
  };

  it('读取真实 Uber 菜单并与最后一次成功全量发布对账', async () => {
    const x = setupReconciliation();
    await expect(x.useCase.execute('pos-store-1')).resolves.toMatchObject({
      storeId: 'pos-store-1',
      uberStoreId: 'uber-store-1',
      retrieved: { itemCount: 2, modifierGroupCount: 1 },
      baseline: { itemCount: 2, modifierGroupCount: 1 },
      reconciliation: {
        matchesLastSuccessfulPublish: true,
        missingItemIds: [],
        extraItemIds: [],
        mismatches: [],
      },
      specialInstructions: {
        expectedDisableItemInstructions: false,
        remoteDisableItemInstructions: null,
        verified: false,
      },
    });
    expect(x.gateway.retrieveMenu).toHaveBeenCalledWith('uber-store-1');
  });

  it('报告价格、availability、modifier 和 required metadata 差异但不修改任何一侧', async () => {
    const x = setupReconciliation({
      ...remote,
      items: remote.items.map((item) =>
        item.id === 'item-1'
          ? {
              ...item,
              priceCents: 799,
              isAvailable: false,
              modifierGroupIds: [],
              preparationType: 'PREPACKAGED' as const,
            }
          : item,
      ),
    });
    const result = await x.useCase.execute('pos-store-1');
    expect(result.reconciliation.matchesLastSuccessfulPublish).toBe(false);
    expect(result.reconciliation.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: 'item-1', field: 'priceCents' }),
        expect.objectContaining({ resourceId: 'item-1', field: 'isAvailable' }),
        expect.objectContaining({
          resourceId: 'item-1',
          field: 'modifierGroupIds',
        }),
        expect.objectContaining({
          resourceId: 'item-1',
          field: 'preparationType',
        }),
      ]),
    );
  });

  it('把 menu/category ID 漂移计入全量对账结果', async () => {
    const x = setupReconciliation({
      ...remote,
      menuIds: ['unexpected-menu'],
      categoryIds: [],
    });
    const result = await x.useCase.execute('pos-store-1');
    expect(result.reconciliation).toMatchObject({
      matchesLastSuccessfulPublish: false,
      missingMenuIds: ['menu-1'],
      extraMenuIds: ['unexpected-menu'],
      missingCategoryIds: ['cat-1'],
      extraCategoryIds: [],
    });
  });

  it('没有成功发布基准时只返回真实数量，不宣称对账成功', async () => {
    const x = setupReconciliation(remote, null);
    await expect(x.useCase.execute('pos-store-1')).resolves.toMatchObject({
      baseline: null,
      reconciliation: { matchesLastSuccessfulPublish: null },
    });
  });

  it('未 provision 门店不会调用 Uber Menu GET', async () => {
    const x = setupReconciliation();
    x.provisionedStores.resolveProvisionedUberStoreId.mockResolvedValue(null);
    await expect(x.useCase.execute('missing')).rejects.toMatchObject({
      code: 'UBER_STORE_NOT_PROVISIONED',
    });
    expect(x.gateway.retrieveMenu).not.toHaveBeenCalled();
  });
});
