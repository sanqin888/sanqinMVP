import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname);
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('Uber cancellation ownership', () => {
  it('keeps canonical cancellation persistence and orchestration out of Uber persistence', () => {
    const importer = source(
      'infrastructure/persistence/uber-order-import-prisma.adapter.ts',
    );

    expect(importer).not.toContain('ORDER_EXTERNAL_CANCELLATION_FINALIZER');
    expect(importer).not.toContain('finalizeConfirmedCancellation');
    expect(importer).not.toContain('saveExistingOrderCancellation');
    expect(importer).not.toMatch(/uberOrderCancellation/);
    expect(importer).not.toMatch(/tx\.order\./);
    expect(importer).not.toMatch(/tx\.orderAmendment\./);
    expect(importer).not.toMatch(/tx\.opsEvent\./);
    expect(importer).not.toContain('ORDER_CANCELLED_LIFECYCLE_EVENT');
    expect(importer).not.toContain('orderCancelledIdempotencyKey');
    expect(importer).not.toMatch(/\borderId\b/);
  });

  it('routes provider-confirmed cancellation through an Uber application port and the sole composition root', () => {
    const port = source(
      'application/shared/uber-canonical-order-cancellation.port.ts',
    );
    const useCase = source('application/orders/uber-order.use-cases.ts');
    const wiring = source('infrastructure/nest/orders.wiring.ts');
    const uberModule = source('ubereats.module.ts');

    expect(port).toContain('UberCanonicalOrderCancellationPort');
    expect(port).not.toMatch(/@prisma\/client|\bPrisma\.|orders\/public-api/);
    expect(useCase).toContain(
      'this.cancellations.finalizeConfirmedCancellation',
    );
    expect(useCase).not.toContain('saveExistingOrderCancellation');
    expect(wiring).toContain('UBER_CANONICAL_ORDER_CANCELLATION');
    expect(uberModule).toContain('UBER_CANONICAL_ORDER_CANCELLATION');
    expect(uberModule).toContain('ORDER_EXTERNAL_CANCELLATION_FINALIZER');
    expect(uberModule).toContain("channel: 'ubereats'");
  });

  it('keeps the Orders cancellation contract stable-only and provider-neutral', () => {
    const contract = source(
      '../../orders/order-external-cancellation.contract.ts',
    );
    const module = source('../../orders/order-external-cancellation.module.ts');

    expect(contract).toContain('OrderExternalCancellationFinalizerPort');
    expect(contract).toContain('orderStableId: string');
    expect(contract).toContain('externalOrderId: string');
    expect(contract).toContain('externalEventId: string');
    expect(contract).not.toMatch(
      /@prisma\/client|\bPrisma\.|\borderId\b|clientRequestId|UberEats|UberOrder/,
    );
    expect(module).toContain("from './orders-prisma'");
    expect(module).not.toMatch(/OrdersModule|integrations\/ubereats/);
  });

  it('makes Orders the only owner of amendment, refund status and cancellation lifecycle persistence', () => {
    const finalizer = source(
      '../../orders/order-external-cancellation.service.ts',
    );

    expect(finalizer).toContain('this.prisma.$transaction');
    expect(finalizer).toContain('tx.order.findFirst');
    expect(finalizer).toContain('tx.orderAmendment.upsert');
    expect(finalizer).toContain('tx.order.update');
    expect(finalizer).toContain('tx.opsEvent.createMany');
    expect(finalizer).toContain('ORDER_CANCELLED_LIFECYCLE_EVENT');
    expect(finalizer).toContain('orderCancelledIdempotencyKey');
    expect(finalizer).not.toMatch(/integrations\/ubereats|UberOrder/);
  });

  it('removes the dead imported-order cancellation compatibility branch', () => {
    const ports = source('application/orders/uber-order.ports.ts');
    const importer = source(
      'infrastructure/persistence/uber-order-import-prisma.adapter.ts',
    );

    const saveImportedOrder =
      ports.match(/saveImportedOrder\(input:\s*\{[\s\S]*?\}\): Promise/)?.[0] ??
      '';
    expect(saveImportedOrder).not.toContain('cancellation:');
    expect(ports).not.toContain('UberOrderCancellationDecision');
    expect(importer).not.toContain('if (input.cancellation)');
    expect(importer).not.toContain('persistCancellation');
  });

  it('wires the narrow Orders cancellation module into both Uber runtimes', () => {
    const uberModule = source('ubereats.module.ts');
    const workerSlice =
      uberModule.match(
        /export function createUberEatsWorkerRuntimeModule[\s\S]*?\n}\n\n\/\*\*/,
      )?.[0] ?? '';

    expect(uberModule).toContain('OrderExternalCancellationModule');
    expect(workerSlice).toContain('OrderExternalCancellationModule');
    expect(workerSlice).not.toContain('OrdersModule');
  });

  it('removes the test-era cancellation table with a non-cascading migration', () => {
    const schema = source('../../../prisma/schema.prisma');
    const migration = source(
      '../../../prisma/migrations/20260910131300_contract_uber_order_cancellation/migration.sql',
    );

    expect(schema).not.toContain('model UberOrderCancellation');
    expect(schema).not.toContain('uberCancellations');
    expect(migration).toContain('DROP TABLE "UberOrderCancellation";');
    expect(migration).not.toMatch(/CASCADE\s*;/);
  });
});
