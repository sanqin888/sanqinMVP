import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORDERS_ROOT = resolve(__dirname);

function read(name: string): string {
  return readFileSync(resolve(ORDERS_ROOT, name), 'utf8');
}

describe('OrderItem snapshot ownership boundary', () => {
  it('keeps canonical item configuration snapshots separate from pricing policy', () => {
    const builder = read('order-item-snapshot.builder.ts');
    const orders = read('orders.service.ts');
    const publicApi = read('public-api.ts');

    expect(builder).toContain('class OrderItemSnapshotBuilder');
    expect(builder).toContain('optionsSnapshot');
    expect(builder).toContain('componentSnapshots');
    expect(builder).not.toContain('DAILY_SPECIAL_OFFERS');
    expect(builder).not.toContain('DailySpecialOffers');
    expect(builder).not.toContain('evaluateOrderPromotions');
    expect(builder).not.toContain('PROMOTION_CONTEXT_READER');

    expect(orders).toContain('this.orderItemSnapshotBuilder.buildMany');
    const amendment = orders.slice(
      orders.indexOf('async createAmendment('),
      orders.indexOf(
        'async advance(',
        orders.indexOf('async createAmendment('),
      ),
    );
    expect(amendment).toContain('this.orderItemSnapshotBuilder.buildMany');
    expect(amendment).not.toContain('this.calculateLineItems(');
    expect(publicApi).not.toContain('OrderItemSnapshotBuilder');
  });
});
