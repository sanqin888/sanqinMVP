import { join } from 'node:path';
import { scanTypeScript } from '../../test/architecture-test.utils';

describe('Uber Eats Orders ingestion public boundary', () => {
  it('consumes Orders ingestion only through orders/public-api', () => {
    const uberFiles = scanTypeScript(__dirname, { productionOnly: true });
    const module = uberFiles.find((file) =>
      file.path.endsWith('ubereats.module.ts'),
    );
    const adapter = uberFiles.find((file) =>
      file.path.endsWith('uber-order-import-prisma.adapter.ts'),
    );

    expect(module).toBeDefined();
    expect(adapter).toBeDefined();
    expect(module!.source).toContain("from '../../orders/public-api'");
    expect(module!.source).toContain('ORDER_INGESTION_PROVIDER');
    expect(adapter!.source).toContain("from '../../../../orders/public-api'");
    expect(adapter!.source).toContain('@Inject(ORDER_INGESTION)');
    expect(adapter!.source).toContain(
      'private readonly ingestion: OrderIngestionPort',
    );
    expect(adapter!.source).not.toContain('OrderIngestionService');
    expect(
      uberFiles.filter((file) =>
        file.source.includes('orders/order-ingestion.service'),
      ),
    ).toEqual([]);
  });

  it('keeps the concrete ingestion service private behind the Orders port', () => {
    const orderFiles = scanTypeScript(join(__dirname, '../../orders'), {
      productionOnly: true,
    });
    const publicApi = orderFiles.find((file) =>
      file.path.endsWith('public-api.ts'),
    );
    const contract = orderFiles.find((file) =>
      file.path.endsWith('order-ingestion.contract.ts'),
    );
    const provider = orderFiles.find((file) =>
      file.path.endsWith('order-ingestion.provider.ts'),
    );
    const service = orderFiles.find((file) =>
      file.path.endsWith('order-ingestion.service.ts'),
    );
    const ordersModule = orderFiles.find((file) =>
      file.path.endsWith('orders.module.ts'),
    );

    expect(publicApi).toBeDefined();
    expect(contract).toBeDefined();
    expect(provider).toBeDefined();
    expect(service).toBeDefined();
    expect(ordersModule).toBeDefined();
    expect(publicApi!.source).toContain('ORDER_INGESTION');
    expect(publicApi!.source).toContain('OrderIngestionPort');
    expect(publicApi!.source).toContain('ORDER_INGESTION_PROVIDER');
    expect(contract!.source).toContain('storeStableId?: string | null;');
    expect(provider!.source).toContain('useClass: OrderIngestionService');
    expect(service!.source).toContain('implements OrderIngestionPort');
    expect(service!.source).toContain('storeId: input.storeStableId');
    expect(ordersModule!.source).toContain('ORDER_INGESTION_PROVIDER');
    expect(ordersModule!.source).toContain('ORDER_INGESTION,');
  });
});
