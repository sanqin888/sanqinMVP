import { join } from 'node:path';
import { scanTypeScript } from '../../test/architecture-test.utils';

describe('Uber Eats store identity architecture', () => {
  it('requires SanQ storeStableId on Operations transport contracts', () => {
    const apiFiles = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    });
    const controller = apiFiles.find((file) =>
      file.path.endsWith('operations.controller.ts'),
    );
    const requests = scanTypeScript(join(__dirname, 'contracts', 'requests'), {
      productionOnly: true,
    }).find((file) => file.path.endsWith('operations.requests.ts'));

    expect(controller).toBeDefined();
    expect(requests).toBeDefined();
    expect(controller!.source).toContain('query.storeStableId');
    expect(controller!.source).not.toContain('query.storeId');
    expect(requests!.source).toContain('storeStableId!: string');
    expect(requests!.source).not.toContain('class StoreIdQuery');
    expect(requests!.source).not.toMatch(/\bstoreId\b/);
  });

  it('persists new store-status tickets under SanQ storeStableId', () => {
    const persistence = scanTypeScript(
      join(__dirname, 'infrastructure', 'persistence'),
      { productionOnly: true },
    ).find((file) =>
      file.path.endsWith('uber-merchant-persistence.adapter.ts'),
    );

    expect(persistence).toBeDefined();
    expect(persistence!.source).toContain('storeId: input.storeStableId');
    expect(persistence!.source).not.toContain('storeId: uberStoreId');
  });
});
