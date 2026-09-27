import type { AccountingFinancialDocumentType } from './contracts/provider-financial';

export type ProviderFinancialSummaryLine = {
  rawName?: string | null;
  component: string;
  amountCents: number;
};

const PROVIDER_FINANCIAL_COMPONENT_PRIORITY = new Map<string, number>([
  ['PAYOUT', 100],
  ['CONTROL_TOTAL', 95],
  ['SALES', 90],
  ['REFUND', 85],
  ['SALES_TAX', 80],
  ['TIP', 75],
  ['COMMISSION', 70],
  ['PROCESSING_FEE', 65],
  ['ADJUSTMENT', 60],
]);

export function isProviderSupportingFinancialDocumentType(
  documentType: AccountingFinancialDocumentType | null | undefined,
): boolean {
  return Boolean(documentType && documentType !== 'STATEMENT');
}

export function selectProviderFinancialSummaryLines<
  T extends ProviderFinancialSummaryLine,
>(lines: readonly T[], limit = 6): T[] {
  if (lines.length <= limit) return [...lines];

  return lines
    .map((line, index) => ({
      line,
      index,
      score:
        (PROVIDER_FINANCIAL_COMPONENT_PRIORITY.get(line.component) ?? 0) +
        (line.amountCents !== 0 ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ line }) => line);
}

export function findProviderSupportingHeadlineLine<
  T extends ProviderFinancialSummaryLine,
>(lines: readonly T[]): T | null {
  return (
    lines.find((line) => line.component === 'PAYOUT') ??
    lines.find((line) => line.component === 'CONTROL_TOTAL') ??
    lines.find((line) => line.rawName?.trim().toLowerCase() === 'net') ??
    null
  );
}
