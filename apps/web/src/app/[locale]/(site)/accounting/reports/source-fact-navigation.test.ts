import { resolveAccountingSourceFactNavigation } from './source-fact-navigation';

describe('B4-C2 source fact navigation mapping', () => {
  it('maps an order sale fact directly to the existing order route', () => {
    expect(
      resolveAccountingSourceFactNavigation({
        locale: 'en',
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: 'c6ab16o6d7urm906lohrep6yg',
      }),
    ).toEqual({
      destination: 'ORDER',
      href: '/en/order/c6ab16o6d7urm906lohrep6yg',
    });
  });

  it.each([
    'accounting.expense_document.v1',
    'accounting.expense_document.v2',
  ])('maps %s to the exact Expense record filter', (sourceFactType) => {
    expect(
      resolveAccountingSourceFactNavigation({
        locale: 'zh',
        sourceFactType,
        sourceFactStableId: 'expense/a b?#',
      }),
    ).toEqual({
      destination: 'EXPENSE',
      href: '/zh/accounting/expenses?documentStableId=expense%2Fa%20b%3F%23',
    });
  });

  it(
    'maps Provider Statement to the canonical Settlements evidence card',
    () => {
      expect(
        resolveAccountingSourceFactNavigation({
          locale: 'en',
          sourceFactType: 'accounting.provider_financial_document.v1',
          sourceFactStableId: 'provider/doc 1',
        }),
      ).toEqual({
        destination: 'PROVIDER_STATEMENT',
        href: '/en/accounting/settlements#provider-provider%2Fdoc%201',
      });
    },
  );

  it(
    'maps Provider Payout to the bank-receipt row instead of a statement relation',
    () => {
      expect(
        resolveAccountingSourceFactNavigation({
          locale: 'en',
          sourceFactType: 'accounting.provider_payout.v1',
          sourceFactStableId: 'payout/1',
        }),
      ).toEqual({
        destination: 'PROVIDER_PAYOUT',
        href: '/en/accounting/settlements#payout-payout%2F1',
      });
    },
  );

  it.each(['payroll.run.accrual.v1', 'payroll.run.reversal.v1'])(
    'maps %s to the Accounting Payroll run locator',
    (sourceFactType) => {
      expect(
        resolveAccountingSourceFactNavigation({
          locale: 'zh',
          sourceFactType,
          sourceFactStableId: 'payroll/run 1',
        }),
      ).toEqual({
        destination: 'PAYROLL_RUN',
        href: '/zh/accounting/payroll?runStableId=payroll%2Frun%201',
      });
    },
  );

  it.each([
    'order.financial_adjustment.v1',
    'order.financial_reversal.v1',
    'payroll.employee-payment.v1',
    'payroll.cra_remittance.v1',
    'accounting.uber_pre_cutover_order_reversal.v1',
    'unknown.fact.v1',
  ])(
    'keeps %s identity-only when no reliable UI key exists',
    (sourceFactType) => {
      expect(
        resolveAccountingSourceFactNavigation({
          locale: 'en',
          sourceFactType,
          sourceFactStableId: 'source_fact_1',
        }),
      ).toBeNull();
    },
  );

  it('falls back when source identity is incomplete', () => {
    expect(
      resolveAccountingSourceFactNavigation({
        locale: 'en',
        sourceFactType: null,
        sourceFactStableId: 'fact_1',
      }),
    ).toBeNull();
    expect(
      resolveAccountingSourceFactNavigation({
        locale: 'en',
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: null,
      }),
    ).toBeNull();
  });
});
