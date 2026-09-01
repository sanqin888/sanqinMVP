import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POS_ROOT = resolve(__dirname);
const API_ROOT = resolve(POS_ROOT, '..');
const ORDERS_ROOT = resolve(API_ROOT, 'orders');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Orders ↔ POS transport boundary', () => {
  it('keeps POS authentication and gateway transport out of Orders composition', () => {
    const controller = read(resolve(ORDERS_ROOT, 'orders.controller.ts'));
    const module = read(resolve(ORDERS_ROOT, 'orders.module.ts'));
    const fulfillment = read(
      resolve(ORDERS_ROOT, 'processors', 'fulfillment.processor.ts'),
    );

    expect(controller).not.toContain('PosDeviceGuard');
    expect(controller).not.toContain('AuthenticatedPosIdentity');
    expect(module).not.toContain('PosDeviceModule');
    expect(module).not.toMatch(/from ['"]\.\.\/pos\//);
    expect(fulfillment).not.toContain('PosGateway');
    expect(fulfillment).not.toContain("from '../../pos/pos.gateway'");
    expect(fulfillment).toContain('POS_PRINT_JOB_DISPATCH_REQUESTED');
  });

  it('makes canonical and compatibility POS order transports use Orders public API', () => {
    const canonical = read(resolve(POS_ROOT, 'pos-orders.controller.ts'));
    const service = read(resolve(POS_ROOT, 'pos-orders.service.ts'));
    const legacy = read(resolve(POS_ROOT, 'legacy-pos-orders.controller.ts'));
    const publicApi = read(resolve(ORDERS_ROOT, 'public-api.ts'));

    for (const source of [canonical, service, legacy]) {
      expect(source).toContain("from '../orders/public-api'");
      expect(source).toContain('POS_ORDER_OPERATIONS');
      expect(source).not.toContain("from '../orders/orders.service'");
      expect(source).not.toContain(
        "from '../orders/order-scheduling-query.service'",
      );
      expect(source).not.toContain("from '../orders/dto/order.dto'");
      expect(source).not.toContain("from '../orders/order-status'");
    }

    expect(legacy).toContain("from '../auth/public-api'");
    expect(legacy).not.toContain("from '../auth/session-auth.guard'");
    expect(legacy).not.toContain("from '../auth/roles.guard'");
    expect(legacy).not.toContain("from '../auth/roles.decorator'");
    expect(publicApi).toContain('POS_ORDER_OPERATIONS');
    expect(publicApi).toContain('PosOrderOperationsPort');
  });

  it('keeps the legacy /orders routes ahead of generic Orders routes in root HTTP composition', () => {
    const composition = read(
      resolve(API_ROOT, 'orders-http-composition.module.ts'),
    );
    const legacyIndex = composition.indexOf('LegacyPosOrdersController');
    const ordersIndex = composition.indexOf('OrdersController');

    expect(composition).toContain('imports: [OrdersModule, PosDeviceModule]');
    expect(composition).toContain(
      'controllers: [LegacyPosOrdersController, OrdersController]',
    );
    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    expect(ordersIndex).toBeGreaterThanOrEqual(0);
  });

  it('keeps POS print-job dispatch implementation on the POS side', () => {
    const listener = read(resolve(POS_ROOT, 'pos-print-dispatch.listener.ts'));
    const publicApi = read(resolve(ORDERS_ROOT, 'public-api.ts'));

    expect(listener).toContain("from '../orders/public-api'");
    expect(listener).toContain('POS_PRINT_JOB_DISPATCH_REQUESTED');
    expect(listener).toContain('this.posGateway.sendPrintJob(request)');
    expect(publicApi).toContain('POS_PRINT_JOB_DISPATCH_REQUESTED');
  });
});
