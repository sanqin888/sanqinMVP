import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, ...parts), 'utf8');

describe('Uber Eats composition roots', () => {
  const httpRoot = read('ubereats.module.ts');
  const httpModule = read('modules', 'ubereats-http.module.ts');
  const workerModule = read(
    'infrastructure',
    'workers',
    'ubereats-worker.module.ts',
  );
  const applicationModule = read('ubereats-application.module.ts');

  it('organizes HTTP capabilities as explicit internal modules', () => {
    for (const capability of ['Merchant', 'Orders', 'Menu', 'Operations']) {
      expect(httpModule).toContain(`UberEats${capability}Module`);
    }
    expect(httpRoot).toContain('UberEatsHttpModule');
  });

  it('keeps HTTP controllers and worker polling providers isolated', () => {
    expect(httpModule).toContain('controllers:');
    expect(httpModule).not.toMatch(/WorkerAdapter|UberWorkerHealthService/);
    expect(workerModule).not.toMatch(/controllers\s*:|UberEatsHttpModule/);
    expect(workerModule).toContain('UberWebhookInboxWorkerAdapter');
    expect(workerModule).toContain('UberOrderActionWorkerAdapter');
    expect(workerModule).toContain('UberMenuPublishConfirmationWorkerAdapter');
  });

  it('exports only tokens/classes already present in the provider set', () => {
    const exportsDefinition = applicationModule.slice(
      applicationModule.indexOf('export const UBER_EATS_PUBLIC_PROVIDERS'),
    );
    expect(applicationModule).toContain('UBER_EATS_INTERNAL_PROVIDERS');
    expect(exportsDefinition).not.toContain('useFactory');
    expect(httpRoot).not.toContain('useFactory');
  });

  it('worker process imports only the dedicated worker composition module', () => {
    const workerRoot = read('..', '..', 'ubereats-worker.module.ts');
    expect(workerRoot).toContain(
      'imports: [UberEatsInfrastructureWorkerModule]',
    );
    expect(workerRoot).not.toMatch(/\bUberEatsModule\b|controllers\s*:/);
    expect(workerRoot).not.toContain('AppModule');
  });

  it('selects polling through module composition instead of runtime config', () => {
    expect(httpRoot).not.toMatch(/WORKER_ENABLED|withWorkers|WorkerAdapter/);
    expect(workerModule).not.toMatch(/WORKER_ENABLED|process\.env/);
  });

  it('does not register compatibility facades or legacy aliases', () => {
    expect(applicationModule).not.toMatch(
      /UberMerchantService|UberMenuService|UberOrderApplication|UberOperationsApplication/,
    );
  });
});
