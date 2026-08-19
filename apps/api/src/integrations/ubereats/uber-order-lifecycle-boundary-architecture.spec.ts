import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname);
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('Uber accepted-order lifecycle boundary architecture', () => {
  it('keeps Uber action completion POS-agnostic while appending acceptance only', () => {
    const adapter = source(
      'infrastructure/persistence/uber-order-action-prisma.adapter.ts',
    );

    expect(adapter).toContain('tx.opsEvent.createMany');
    expect(adapter).toContain('ORDER_ACCEPTED_LIFECYCLE_EVENT');
    expect(adapter).not.toContain('ORDER_PREP_STARTED_LIFECYCLE_EVENT');
    expect(adapter).not.toMatch(/\bPosGateway\b|\bFulfillmentProcessor\b/);
    expect(adapter).not.toMatch(/pos\.gateway|fulfillment\.processor/);
  });

  it('keeps scheduled activation and POS materialization in Orders, not Uber worker', () => {
    const lifecycle = source(
      '../../orders/processors/order-lifecycle-outbox.processor.ts',
    );
    const scheduler = source(
      '../../orders/processors/scheduled-order.processor.ts',
    );
    const activation = source('../../orders/order-preparation.service.ts');
    const worker = source('worker.ts');
    const uberModule = source('ubereats.module.ts');

    expect(lifecycle).toContain('ORDER_PREP_STARTED_LIFECYCLE_EVENT');
    expect(lifecycle).toContain('FulfillmentProcessor');
    expect(lifecycle).toContain('FOR UPDATE OF event SKIP LOCKED');
    expect(lifecycle).toContain('FROM "PosPrintJob" job');
    expect(activation).toContain('FOR UPDATE OF orders SKIP LOCKED');
    expect(activation).toContain('orderPrepStartedIdempotencyKey');
    expect(scheduler).not.toMatch(/PosGateway|FulfillmentProcessor|PosPrintJob/);
    expect(worker).not.toMatch(/FulfillmentProcessor|PosGateway|OrdersModule/);
    expect(uberModule).toMatch(
      /createUberEatsWorkerRuntimeModule[\s\S]*imports:\s*\[PrismaModule\]/,
    );
  });

  it('shares preparation policy through the existing public shared Order package', () => {
    const uberPolicy = source(
      'domain/orders/uber-order-preparation.policy.ts',
    );
    expect(uberPolicy).toContain("from '@shared/order'");
    expect(uberPolicy).not.toMatch(
      /apps\/api|\.\.\/\.\.\/\.\.\/\.\.\/orders/,
    );
  });
});
