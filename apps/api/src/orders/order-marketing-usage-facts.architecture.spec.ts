import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ordersRoot = resolve(__dirname);

describe('Order marketing usage facts boundary', () => {
  it('keeps raw promotion snapshots owner-private and reuses Orders financial sale evidence', () => {
    const contract = readFileSync(
      resolve(ordersRoot, 'order-marketing-usage-facts-reader.contract.ts'),
      'utf8',
    );
    const service = readFileSync(
      resolve(ordersRoot, 'order-marketing-usage-facts-reader.service.ts'),
      'utf8',
    );

    expect(contract).not.toContain('promotionSnapshot');
    expect(contract).not.toContain('Prisma');
    expect(service).toContain('ORDER_FINANCIAL_FACTS_READER');
    expect(service).not.toContain("from '../reports/");
    expect(service).not.toContain("from '../promotions/");
  });
});
