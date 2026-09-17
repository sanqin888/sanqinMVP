import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const API_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_ROOT, 'accounting');

const read = (relativePath: string) =>
  readFileSync(resolve(API_ROOT, relativePath), 'utf8');

const FOREIGN_OWNER_PRISMA_DELEGATES = [
  'order',
  'orderItem',
  'orderAmendment',
  'paymentTransaction',
  'paymentCheckoutAttempt',
  'loyaltyAccount',
  'loyaltyTenderReservation',
  'loyaltyLedger',
  'uberStoreMapping',
] as const;

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

  it('keeps all Accounting production source off contracted foreign-owner Prisma delegates', () => {
    const productionFiles = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    });

    for (const delegate of FOREIGN_OWNER_PRISMA_DELEGATES) {
      const pattern = new RegExp(`\\.${delegate}\\b`);
      const violations = productionFiles
        .filter(({ source }) => pattern.test(source))
        .map(({ path }) => path.replace(`${API_ROOT}/`, ''))
        .sort();

      expect(violations).toEqual([]);
    }
  });
});
