import {
  AccountingFinancialProvider,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
} from './accounting-contracts';

export const ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS = {
  [AccountingFinancialProvider.CLOVER]: 'account_clover_pending',
  [AccountingFinancialProvider.UBER_EATS]: 'account_uber_pending',
  [AccountingFinancialProvider.FANTUAN]: 'account_fantuan_pending',
} as const satisfies Record<AccountingFinancialProviderValue, string>;

export const providerPendingAccountStableId = (
  provider: AccountingFinancialProviderValue,
): string => {
  const accountStableId = ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[provider];
  if (!accountStableId) {
    throw new Error(`Unsupported financial provider: ${String(provider)}`);
  }
  return accountStableId;
};
