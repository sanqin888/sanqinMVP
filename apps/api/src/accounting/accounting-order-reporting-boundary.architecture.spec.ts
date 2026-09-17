import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '..');

const read = (relativePath: string) =>
  readFileSync(resolve(API_ROOT, relativePath), 'utf8');

describe('Phase 9 Slice 7-D Accounting -> Orders reporting boundary', () => {
  it('keeps Accounting dimensionSlice off Orders persistence', () => {
    const accountingService = read('accounting/accounting.service.ts');
    const accountingModule = read('accounting/accounting.module.ts');

    expect(accountingService).not.toContain('this.prisma.order');
    expect(accountingService).toContain('ORDER_REPORTING_FACTS_READER');
    expect(accountingService).toContain('readPaidTotalDimensionsForRange');
    expect(accountingModule).toContain('OrderReportingFactsModule');
  });

  it('keeps the paid-total projection explicitly non-canonical and Orders-owned', () => {
    const contract = read('orders/order-reporting-facts-reader.contract.ts');
    const publicApi = read('orders/public-api.ts');

    expect(contract).toContain('OrderPaidTotalDimensionsV1');
    expect(contract).toContain('readPaidTotalDimensionsForRange');
    expect(contract).toContain('not a canonical revenue fact');
    expect(publicApi).toContain('OrderPaidTotalDimensionsV1');
    expect(publicApi).toContain('ORDER_REPORTING_FACTS_READER');
  });
});
