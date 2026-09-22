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

describe('B2-E Accounting legacy Orders paid-total contraction', () => {
  it('removes the Accounting reporting-reader dependency while retaining operational Reports', () => {
    const accountingService = read('accounting/accounting.service.ts');
    const accountingModule = read('accounting/accounting.module.ts');
    const reportsModule = read('reports/reports.module.ts');

    expect(accountingService).not.toContain('this.prisma.order');
    expect(accountingService).not.toContain('ORDER_REPORTING_FACTS_READER');
    expect(accountingService).not.toContain('readPaidTotalDimensionsForRange');
    expect(accountingService).not.toContain('dimensionSlice');
    expect(accountingModule).not.toContain('OrderReportingFactsModule');

    expect(reportsModule).toContain('OrderReportingFactsModule');
    expect(reportsModule).toContain('ORDER_REPORTING_FACTS_READER');
    expect(reportsModule).toContain('readMetricsForRange');
    expect(reportsModule).toContain('readItemsForRange');
  });

  it('retires only the paid-total Orders reporting contract surface', () => {
    const contract = read('orders/order-reporting-facts-reader.contract.ts');
    const publicApi = read('orders/public-api.ts');

    expect(contract).not.toContain('OrderPaidTotalDimensionFactV1');
    expect(contract).not.toContain('OrderPaidTotalDimensionsV1');
    expect(contract).not.toContain('readPaidTotalDimensionsForRange');
    expect(publicApi).not.toContain('OrderPaidTotalDimensionFactV1');
    expect(publicApi).not.toContain('OrderPaidTotalDimensionsV1');
    expect(publicApi).toContain('ORDER_REPORTING_FACTS_READER');
    expect(publicApi).toContain('OrderReportingFactsModule');
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
