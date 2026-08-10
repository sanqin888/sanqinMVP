import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('UberEatsModule focused use-case contract', () => {
  const source = readFileSync(join(__dirname, 'ubereats.module.ts'), 'utf8');
  const publicUseCases = [
    'UberMenuDraftService',
    'UberMenuPublishService',
    'UberMenuAvailabilityService',
    'RequestUberOrderActionUseCase',
    'SyncUberOrderStatusUseCase',
    'ListPendingUberOrdersQuery',
    'StartUberOAuthUseCase',
    'CompleteUberOAuthUseCase',
    'DiscoverUberStoresUseCase',
    'MapUberStoreUseCase',
    'ProvisionUberStoreUseCase',
    'SyncUberStoreStatusUseCase',
  ];

  it.each(publicUseCases)('registers the focused %s boundary', (useCase) => {
    expect(source).toContain(useCase);
  });

  it('does not register an all-purpose Uber facade', () => {
    expect(source).not.toMatch(
      /UberMerchantService|UberMenuService|UberOrderApplication|UberOperationsApplication/,
    );
  });
});
