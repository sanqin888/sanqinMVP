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

export function settlementBlockReasonGuidance(
  reason: string,
  isZh: boolean,
): string | null {
  if (reason !== 'UBER_OTHER_EARNINGS_REQUIRES_SEMANTIC_REVIEW') return null;
  return isZh
    ? 'Uber 的 Other Earnings 是语义不稳定的汇总桶，不能自动入账。请先用 Payment Details 核对来源；如果明细确认它是 Price adjustments，请在上方人工复核中使用 SEMANTIC_CLASSIFICATION：Other Earnings → SALES，Tax on Other Earnings → SALES_TAX。确认复核后重新运行 Shadow Preview。'
    : 'Uber Other Earnings is an ambiguous summary bucket and cannot be posted automatically. Verify the source in Payment Details first. If the detail confirms Price adjustments, use SEMANTIC_CLASSIFICATION in Human Review above: Other Earnings → SALES and Tax on Other Earnings → SALES_TAX, then confirm the review and rerun Shadow Preview.';
}
