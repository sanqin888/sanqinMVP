import type {
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialLine,
} from '../contracts/provider-financial';
import type { ProviderSettlementPostingState } from '../contracts/settlements';

export type SettlementDocumentBucket = 'PENDING' | 'POSTED' | 'SUPPORTING';

export function settlementDocumentBucket(
  document: AccountingProviderFinancialDocument,
  postingState: ProviderSettlementPostingState | undefined,
): SettlementDocumentBucket {
  if (document.documentType !== 'STATEMENT') return 'SUPPORTING';
  return postingState?.postingState === 'POSTED' ? 'POSTED' : 'PENDING';
}

export function findSettlementNetLine(
  lines: AccountingProviderFinancialLine[],
): AccountingProviderFinancialLine | null {
  return (
    lines.find((line) => line.component === 'PAYOUT') ??
    lines.find((line) => line.rawName?.trim().toLowerCase() === 'net total') ??
    null
  );
}
