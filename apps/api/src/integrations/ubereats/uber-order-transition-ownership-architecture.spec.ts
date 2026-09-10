import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname);
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const methodSlice = (contents: string, start: string, end: string): string => {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  return startIndex < 0
    ? ''
    : contents.slice(startIndex, endIndex < 0 ? undefined : endIndex);
};

describe('Uber provider-confirmed Order transition ownership', () => {
  it('keeps Uber completion persistence limited to the action lease and fence', () => {
    const adapter = source(
      'infrastructure/persistence/uber-order-action-prisma.adapter.ts',
    );
    const completion = methodSlice(
      adapter,
      'async completeWithinTransaction',
      'async markFailed',
    );

    expect(completion).toContain('tx.uberOrderAction.findFirst');
    expect(completion).toContain('leaseToken: input.leaseToken');
    expect(completion).toContain('tx.uberOrderAction.updateMany');
    expect(completion).toContain("claimed.action === 'ACCEPT'");
    expect(completion).not.toMatch(/tx\.order\.|tx\.opsEvent\./);
    expect(completion).not.toContain('this.prisma.$transaction');
    expect(adapter).not.toMatch(/orders\/order-lifecycle/);
  });

  it('makes Orders own the transaction, canonical transition and accepted lifecycle', () => {
    const coordinator = source(
      '../../orders/order-external-transition.service.ts',
    );
    const extensionIndex = coordinator.indexOf(
      'const completion = await withinTransaction',
    );
    const orderIndex = coordinator.indexOf('tx.order.findUnique');

    expect(coordinator).toContain('this.prisma.$transaction');
    expect(extensionIndex).toBeGreaterThan(-1);
    expect(orderIndex).toBeGreaterThan(extensionIndex);
    expect(coordinator).toContain('tx.order.updateMany');
    expect(coordinator).toContain('tx.opsEvent.createMany');
    expect(coordinator).toContain('ORDER_ACCEPTED_LIFECYCLE_EVENT');
    expect(coordinator).toContain('orderAcceptedIdempotencyKey');
    expect(coordinator).not.toMatch(/integrations\/ubereats|UberOrder/);
  });

  it('keeps the Orders public transition contract persistence- and provider-neutral', () => {
    const contract = source('../../orders/order-external-transition.contract.ts');
    const module = source('../../orders/order-external-transition.module.ts');

    expect(contract).toContain('OrderExternalTransitionCoordinatorPort');
    expect(contract).toContain('OrderExternalTransitionTransaction');
    expect(contract).toContain('acceptanceConfirmed: boolean');
    expect(contract).not.toMatch(
      /@prisma\/client|\bPrisma\.|\borderId\b|clientRequestId|UberEats|UberOrder/,
    );
    expect(module).toContain("from './orders-prisma'");
    expect(module).not.toMatch(/OrdersModule|integrations\/ubereats/);
  });

  it('binds the cross-context completion only in the Uber composition root', () => {
    const uberModule = source('ubereats.module.ts');
    const ordersWiring = source('infrastructure/nest/orders.wiring.ts');
    const workerSlice =
      uberModule.match(
        /export function createUberEatsWorkerRuntimeModule[\s\S]*?\n}\n\n\/\*\*/,
      )?.[0] ?? '';

    expect([
      ...uberModule.matchAll(/provide:\s*UBER_ORDER_ACTION_REPOSITORY\b/g),
    ]).toHaveLength(1);
    expect(uberModule).toContain('ORDER_EXTERNAL_TRANSITION_COORDINATOR');
    expect(uberModule).toContain('persistence.completeWithinTransaction');
    expect(ordersWiring).not.toMatch(
      /provide:\s*UBER_ORDER_ACTION_REPOSITORY\b/,
    );
    expect(workerSlice).toContain('OrderExternalTransitionModule');
    expect(workerSlice).not.toContain('OrdersModule');
  });
});
