import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname);
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('Uber accepted-order lifecycle boundary architecture', () => {
  it('keeps Uber action completion POS-agnostic while appending a durable Order lifecycle fact', () => {
    const adapter = source(
      'infrastructure/persistence/uber-order-action-prisma.adapter.ts',
    );

    expect(adapter).toContain('tx.opsEvent.createMany');
    expect(adapter).toContain("source: ORDER_LIFECYCLE_OUTBOX_SOURCE");
    expect(adapter).not.toMatch(/\bPosGateway\b|\bFulfillmentProcessor\b/);
    expect(adapter).not.toMatch(/pos\.gateway|fulfillment\.processor/);
  });

  it('keeps POS materialization in the Orders API runtime rather than the Uber worker runtime', () => {
    const lifecycle = source(
      '../../orders/processors/order-lifecycle-outbox.processor.ts',
    );
    const worker = source('worker.ts');
    const uberModule = source('ubereats.module.ts');

    expect(lifecycle).toContain('FulfillmentProcessor');
    expect(lifecycle).toContain('FOR UPDATE OF event SKIP LOCKED');
    expect(lifecycle).toContain('FROM "PosPrintJob" job');
    expect(worker).not.toMatch(/FulfillmentProcessor|PosGateway|OrdersModule/);
    expect(uberModule).toMatch(
      /createUberEatsWorkerRuntimeModule[\s\S]*imports:\s*\[PrismaModule\]/,
    );
  });
});
