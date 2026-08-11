import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('UberEatsModule focused use-case contract', () => {
  const source = readFileSync(join(__dirname, 'ubereats.module.ts'), 'utf8');
  const publicUseCases = [
    'UberMenuDraftUseCase',
    'PublishUberMenuUseCase',
    'UberMenuAvailabilityUseCase',
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

  it('keeps polling providers out of the default HTTP module', () => {
    const httpMetadata = source.slice(
      source.indexOf('@Module('),
      source.indexOf('export class'),
    );
    const workerMetadata = source.slice(source.indexOf('static withWorkers'));
    expect(httpMetadata).not.toContain('UberWebhookInboxWorkerAdapter');
    expect(workerMetadata).toContain('UberWebhookInboxWorkerAdapter');
  });
});
