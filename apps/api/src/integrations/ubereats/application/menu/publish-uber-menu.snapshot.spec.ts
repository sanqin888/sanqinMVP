import { PublishUberMenuUseCase } from './publish-uber-menu.use-case';

describe('PublishUberMenuUseCase published item snapshots', () => {
  it('把实际发送的 Uber nodeId 与 SanQ stableId 一起交给 publication repository', async () => {
    const createAttempt = jest.fn().mockResolvedValue({
      attemptId: 'attempt-1',
      storeId: 'pos-1',
      idempotencyKey: 'key-1',
      businessVersion: 'version-1',
      status: 'SUBMITTED',
      uberRequestId: null,
      uberResourceId: null,
    });
    const useCase = new PublishUberMenuUseCase(
      {
        resolveProvisionedUberStoreId: jest.fn().mockResolvedValue({
          posExternalStoreId: 'pos-1',
          uberStoreId: 'uber-1',
        }),
      } as never,
      {
        loadPublishSnapshot: jest.fn().mockResolvedValue({
          storeId: 'pos-1',
          uberStoreId: 'uber-1',
          timezone: 'UTC',
          taxRate: 13,
          categories: [
            {
              stableId: 'category-1',
              name: 'Main',
              itemStableIds: ['item-1'],
            },
          ],
          items: [
            {
              stableId: 'item-1',
              categoryStableId: 'category-1',
              name: 'Noodles',
              description: null,
              priceCents: 1200,
              sourcePriceCents: 1200,
              overridePriceCents: null,
              priceValueSource: 'SANQ_SOURCE',
              imageUrl: null,
              isAvailable: true,
              modifierGroupStableIds: [],
            },
          ],
          modifierGroups: [],
          modifierOptions: [],
        }),
      } as never,
      {
        findLastSucceededPayload: jest.fn().mockResolvedValue(null),
        listIntentionalPriceRestores: jest.fn().mockResolvedValue(new Set()),
        recordCriticalRiskAcknowledgement: jest.fn(),
        findSucceededAttempt: jest.fn().mockResolvedValue(null),
        createAttempt,
        markPublishVersionSucceeded: jest.fn().mockResolvedValue(undefined),
        markFailed: jest.fn().mockResolvedValue(true),
      } as never,
      {
        uploadMenu: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        validateImages: jest
          .fn()
          .mockResolvedValue({ valid: true, failures: [] }),
      } as never,
      { publicBaseUrl: 'https://sanq.ca/' },
    );

    await useCase.execute({ storeId: 'pos-1', taxRateConfirmed: true });

    expect(createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        totalItems: 1,
        publishedItems: [
          {
            uberItemId: expect.stringMatching(/^sanq:/),
            menuItemStableId: 'item-1',
            publishedPriceCents: 1200,
            publishedIsAvailable: true,
            publishedName: 'Noodles',
          },
        ],
      }),
    );
  });
});
