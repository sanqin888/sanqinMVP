import { existsSync, readFileSync } from 'node:fs';
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

  it('makes the canonical POS order transport use Orders public API', () => {
    const canonical = read(resolve(POS_ROOT, 'pos-orders.controller.ts'));
    const service = read(resolve(POS_ROOT, 'pos-orders.service.ts'));
    const publicApi = read(resolve(ORDERS_ROOT, 'public-api.ts'));

    for (const source of [canonical, service]) {
      expect(source).toContain("from '../orders/public-api'");
      expect(source).toContain('POS_ORDER_OPERATIONS');
      expect(source).not.toContain("from '../orders/orders.service'");
      expect(source).not.toContain(
        "from '../orders/order-scheduling-query.service'",
      );
      expect(source).not.toContain("from '../orders/dto/order.dto'");
      expect(source).not.toContain("from '../orders/order-status'");
    }

    expect(publicApi).toContain('POS_ORDER_OPERATIONS');
    expect(publicApi).toContain('PosOrderOperationsPort');
  });

  it('keeps retired /orders/* POS compatibility transport deleted', () => {
    const retiredPaths = [
      resolve(POS_ROOT, 'legacy-pos-orders.controller.ts'),
      resolve(API_ROOT, 'orders-http-composition.module.ts'),
    ];
    const ordersController = read(resolve(ORDERS_ROOT, 'orders.controller.ts'));
    const ordersModule = read(resolve(ORDERS_ROOT, 'orders.module.ts'));
    const appModule = read(resolve(API_ROOT, 'app.module.ts'));
    const canonical = read(resolve(POS_ROOT, 'pos-orders.controller.ts'));

    for (const retiredPath of retiredPaths) {
      expect(existsSync(retiredPath)).toBe(false);
    }

    expect(ordersController).toContain("@Controller('orders')");
    for (const legacyRoute of [
      "@Get('recent')",
      "@Get('board')",
      "@Patch(':orderStableId/status')",
      "@Post(':orderStableId/amendments')",
      "@Post(':orderStableId/advance')",
      "@Get('scheduled')",
      "@Get(':orderStableId/fulfillment-timing')",
      "@Post(':orderStableId/preparation/start')",
    ]) {
      expect(ordersController).not.toContain(legacyRoute);
    }

    expect(ordersModule).toContain('controllers: [OrdersController]');
    expect(ordersModule).not.toContain('PosDeviceModule');
    expect(appModule).toContain("import { OrdersModule } from './orders/public-api'");
    expect(appModule).toContain('    OrdersModule,');
    expect(appModule).not.toContain('OrdersHttpCompositionModule');

    expect(canonical).toContain("@Controller('pos/orders')");
    for (const canonicalRoute of [
      "@Get('recent')",
      "@Get('board')",
      "@Patch(':orderStableId/status')",
      "@Post(':orderStableId/amendments')",
      "@Post(':orderStableId/advance')",
      "@Get('scheduled')",
      "@Get(':orderStableId/fulfillment-timing')",
      "@Post(':orderStableId/preparation/start')",
    ]) {
      expect(canonical).toContain(canonicalRoute);
    }
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
