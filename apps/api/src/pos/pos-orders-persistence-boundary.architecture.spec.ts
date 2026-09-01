import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POS_ROOT = resolve(__dirname);
const ORDERS_ROOT = resolve(POS_ROOT, '..', 'orders');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('POS to Orders persistence boundary', () => {
  it('keeps POS summary and amendment-history reads off Orders Prisma delegates', () => {
    const summary = read(resolve(POS_ROOT, 'pos-summary.service.ts'));
    const orders = read(resolve(POS_ROOT, 'pos-orders.service.ts'));
    const module = read(resolve(POS_ROOT, 'pos.module.ts'));

    for (const source of [summary, orders]) {
      expect(source).toContain("from '../orders/public-api'");
      expect(source).toContain('POS_ORDER_READ');
      expect(source).not.toContain('PrismaService');
      expect(source).not.toMatch(/this\.prisma\.order(?:Amendment)?\b/);
    }
    expect(module).toContain("from '../orders/public-api'");
    expect(module).not.toContain("from '../orders/orders.module'");
  });

  it('keeps the POS financial projection and amendment persistence adapter owned by Orders', () => {
    const contract = read(resolve(ORDERS_ROOT, 'pos-order-read.contract.ts'));
    const service = read(resolve(ORDERS_ROOT, 'pos-order-read.service.ts'));
    const publicApi = read(resolve(ORDERS_ROOT, 'public-api.ts'));

    expect(contract).toContain('PosOrderReadPort');
    expect(contract).not.toMatch(/\b(?:orderDbId|orderId)\s*:/);
    expect(service).toContain('this.prisma.order.findMany');
    expect(service).toContain('this.prisma.orderAmendment.groupBy');
    expect(service).toContain('this.prisma.orderAmendment.findMany');
    expect(publicApi).toContain('POS_ORDER_READ');
    expect(publicApi).toContain('PosOrderReadPort');
  });
});
