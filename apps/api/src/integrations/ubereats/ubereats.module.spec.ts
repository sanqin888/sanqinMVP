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

  it('production worker root imports the explicit worker composition only', () => {
    const workerRoot = readFileSync(
      join(__dirname, '..', '..', 'ubereats-worker.module.ts'),
      'utf8',
    );
    expect(workerRoot).toContain('imports: [UberEatsModule.withWorkers()]');
    expect(workerRoot).not.toMatch(/controllers\s*:/);
    expect(workerRoot).not.toContain('AppModule');
  });

  it('worker entrypoint fails closed when enablement is missing', () => {
    const entrypoint = readFileSync(
      join(__dirname, '..', '..', 'ubereats-worker.main.ts'),
      'utf8',
    );
    expect(entrypoint).toContain("env.UBER_EATS_WORKER_ENABLED !== 'true'");
    expect(entrypoint).toContain('throw new Error');
  });

  it('deployment explicitly separates API and worker enablement', () => {
    const compose = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'docker-compose.yml'),
      'utf8',
    );
    expect(compose).toContain('UBER_EATS_WORKER_ENABLED: "false"');
    expect(compose).toContain('UBER_EATS_WORKER_ENABLED: "true"');
    expect(compose).toContain('dist/ubereats-worker.main.js');
  });
});
