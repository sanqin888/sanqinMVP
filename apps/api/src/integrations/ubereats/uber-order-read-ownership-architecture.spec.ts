import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scanTypeScript } from '../../test/architecture-test.utils';

const ROOT = resolve(__dirname);
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('Uber canonical Order read ownership', () => {
  it('keeps all pure canonical reads behind the Orders public capability', () => {
    const persistence = scanTypeScript(
      join(ROOT, 'infrastructure', 'persistence'),
      { productionOnly: true },
    );
    const directReads = persistence.flatMap(({ path, source: contents }) =>
      [
        ...contents.matchAll(
          /this\.prisma\.order\.(?:findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy)\s*\(/g,
        ),
      ].map(() => path),
    );

    expect(directReads).toEqual([]);
  });

  it('retains only the cancellation transaction read reserved for 8.3C', () => {
    const action = source(
      'infrastructure/persistence/uber-order-action-prisma.adapter.ts',
    );
    const importer = source(
      'infrastructure/persistence/uber-order-import-prisma.adapter.ts',
    );
    const importPorts = source('application/orders/uber-order.ports.ts');

    expect(action).not.toMatch(/tx\.order\./);
    expect(importer.match(/tx\.order\.findFirst\s*\(/g)).toHaveLength(1);
    expect(importPorts).not.toMatch(/\borderId\b/);
    expect(importer).toContain('orderStableId: input.orderStableId');
    expect(importer).toContain('orderId: order.id');
  });

  it('keeps the Orders contract stable-only and persistence-type free', () => {
    const contract = source(
      '../../orders/order-external-facts-reader.contract.ts',
    );
    const module = source('../../orders/order-external-facts.module.ts');

    expect(contract).toContain('OrderExternalFactsReaderPort');
    expect(contract).toContain('orderStableId: string');
    expect(contract).not.toMatch(
      /@prisma\/client|\bPrisma\.|\borderId\b|clientRequestId/,
    );
    expect(module).toContain("from './orders-prisma'");
    expect(module).not.toMatch(/OrdersModule|integrations\/ubereats/);
  });

  it('wires the narrow owner module into both runtimes without widening the worker', () => {
    const uberModule = source('ubereats.module.ts');
    const workerSlice =
      uberModule.match(
        /export function createUberEatsWorkerRuntimeModule[\s\S]*?\n}\n\n\/\*\*/,
      )?.[0] ?? '';

    expect(uberModule).toContain('ORDER_EXTERNAL_FACTS_READER');
    expect(uberModule).toContain('UBER_CANONICAL_ORDER_FACTS_QUERY');
    expect(workerSlice).toContain('OrderExternalFactsModule');
    expect(workerSlice).not.toContain('OrdersModule');
  });
});
