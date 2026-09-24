export type AccountingSourceFactDestination =
  | 'ORDER'
  | 'EXPENSE'
  | 'PROVIDER_STATEMENT'
  | 'PROVIDER_PAYOUT'
  | 'PAYROLL_RUN';

export type AccountingSourceFactNavigation = {
  destination: AccountingSourceFactDestination;
  href: string;
};

export function resolveAccountingSourceFactNavigation(input: {
  locale: 'en' | 'zh';
  sourceFactType: string | null;
  sourceFactStableId: string | null;
}): AccountingSourceFactNavigation | null {
  const sourceFactType = input.sourceFactType?.trim();
  const sourceFactStableId = input.sourceFactStableId?.trim();
  if (!sourceFactType || !sourceFactStableId) return null;

  const stableId = encodeURIComponent(sourceFactStableId);
  const accountingRoot = `/${input.locale}/accounting`;

  if (sourceFactType === 'order.financial_sale.v1') {
    return {
      destination: 'ORDER',
      href: `/${input.locale}/order/${stableId}`,
    };
  }

  if (
    sourceFactType === 'accounting.expense_document.v1' ||
    sourceFactType === 'accounting.expense_document.v2'
  ) {
    return {
      destination: 'EXPENSE',
      href: `${accountingRoot}/expenses?documentStableId=${stableId}`,
    };
  }

  if (sourceFactType === 'accounting.provider_financial_document.v1') {
    return {
      destination: 'PROVIDER_STATEMENT',
      href: `${accountingRoot}/settlements#provider-${stableId}`,
    };
  }

  if (sourceFactType === 'accounting.provider_payout.v1') {
    return {
      destination: 'PROVIDER_PAYOUT',
      href: `${accountingRoot}/settlements#payout-${stableId}`,
    };
  }

  if (
    sourceFactType === 'payroll.run.accrual.v1' ||
    sourceFactType === 'payroll.run.reversal.v1'
  ) {
    return {
      destination: 'PAYROLL_RUN',
      href: `${accountingRoot}/payroll?runStableId=${stableId}`,
    };
  }

  return null;
}
