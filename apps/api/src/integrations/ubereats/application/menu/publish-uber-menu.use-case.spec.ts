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
    expect(x.snapshots.loadPublishSnapshot).toHaveBeenCalledWith('store-1');
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
