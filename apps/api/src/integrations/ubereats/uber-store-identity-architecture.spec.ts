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

  it('uses explicit SanQ storeStableId naming across availability and order admission', () => {
    const applicationFiles = scanTypeScript(join(__dirname, 'application'), {
      productionOnly: true,
    });
    const persistenceFiles = scanTypeScript(
      join(__dirname, 'infrastructure', 'persistence'),
      { productionOnly: true },
    );
    const apiFiles = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    });
    const ordersFiles = scanTypeScript(join(__dirname, '..', '..', 'orders'), {
      productionOnly: true,
    });
    const publicApi = scanTypeScript(__dirname, {
      productionOnly: true,
    }).find((file) => file.path.endsWith('public-api.ts'));
    const crossContextResponses = scanTypeScript(
      join(__dirname, 'contracts', 'responses'),
      { productionOnly: true },
    ).find((file) => file.path.endsWith('cross-context.responses.ts'));
    const availability = applicationFiles.find((file) =>
      file.path.endsWith('uber-menu-availability.use-case.ts'),
    );
    const admission = applicationFiles.find((file) =>
      file.path.endsWith('uber-order-admission.service.ts'),
    );
    const orderUseCases = applicationFiles.find((file) =>
      file.path.endsWith('uber-order.use-cases.ts'),
    );
    const orderPorts = applicationFiles.find((file) =>
      file.path.endsWith('uber-order.ports.ts'),
    );
    const orderPersistence = persistenceFiles.find((file) =>
      file.path.endsWith('uber-order-import-prisma.adapter.ts'),
    );
    const orderIngestion = ordersFiles.find((file) =>
      file.path.endsWith('order-ingestion.service.ts'),
    );
    const menuController = apiFiles.find((file) =>
      file.path.endsWith('menu.controller.ts'),
    );

    expect(publicApi).toBeDefined();
    expect(crossContextResponses).toBeDefined();
    expect(availability).toBeDefined();
    expect(admission).toBeDefined();
    expect(orderUseCases).toBeDefined();
    expect(orderPorts).toBeDefined();
    expect(orderPersistence).toBeDefined();
    expect(orderIngestion).toBeDefined();
    expect(menuController).toBeDefined();
    expect(publicApi!.source).toContain('storeStableId?: string;');
    expect(crossContextResponses!.source).toContain('storeStableId: string;');
    expect(availability!.source).toContain('storeId: mapping.uberStoreId');
    expect(availability!.source).toContain(
      'storeStableId: mapping.storeStableId',
    );
    expect(admission!.source).not.toContain('posStoreId');
    expect(orderUseCases!.source).not.toContain('posStoreId');
    expect(orderPorts!.source).not.toContain('posStoreId');
    expect(orderPersistence!.source).not.toContain('posStoreId');
    expect(orderPersistence!.source).toContain('storeStableId: input.storeStableId');
    expect(orderIngestion!.source).toContain('storeId: input.storeStableId');
    expect(menuController!.source).toContain('storeStableId: dto.storeId');
  });

  it('keeps Uber order store policy reads behind UBER_STORE_CONFIG_QUERY', () => {
    const persistenceFiles = scanTypeScript(
      join(__dirname, 'infrastructure', 'persistence'),
      { productionOnly: true },
    );
    const applicationFiles = scanTypeScript(join(__dirname, 'application'), {
      productionOnly: true,
    });
    const nestFiles = scanTypeScript(
      join(__dirname, 'infrastructure', 'nest'),
      { productionOnly: true },
    );
    const orderPersistence = persistenceFiles.find((file) =>
      file.path.endsWith('uber-order-import-prisma.adapter.ts'),
    );
    const admission = applicationFiles.find((file) =>
      file.path.endsWith('uber-order-admission.service.ts'),
    );
    const orderUseCases = applicationFiles.find((file) =>
      file.path.endsWith('uber-order.use-cases.ts'),
    );
    const orderWiring = nestFiles.find((file) =>
      file.path.endsWith('orders.wiring.ts'),
    );

    expect(orderPersistence).toBeDefined();
    expect(admission).toBeDefined();
    expect(orderUseCases).toBeDefined();
    expect(orderWiring).toBeDefined();
    expect(orderPersistence!.source).not.toContain('getStoreAllergyPolicy(');
    expect(orderPersistence!.source).not.toContain(
      'getStoreAutoAcceptOnlineOrders(',
    );
    expect(orderPersistence!.source).not.toContain('prisma.store');
    expect(admission!.source).toContain(
      'this.storeConfig.getStoreAllergyPolicy(',
    );
    expect(orderUseCases!.source).toContain(
      'this.storeConfig.getStoreAutoAcceptOnlineOrders(',
    );
    expect(orderWiring!.source).toContain('UBER_STORE_CONFIG_QUERY');
    expect(orderWiring!.source).toContain(
      'storeConfig: UberStoreConfigQueryPort',
    );
  });
});
