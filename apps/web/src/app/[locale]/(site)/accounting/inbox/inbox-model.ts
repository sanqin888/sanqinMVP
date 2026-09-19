import type {
  AccountingInboxItem,
  AccountingInboxParseResult,
} from '../contracts/inbox';

export type AccountingExpenseReviewRow = {
  key: string;
  categoryStableId: string;
  amount: string;
  tax: string;
};

export type AccountingReviewLineItemHint = {
  description: string | null;
  priceCents: number;
  confidence: number | null;
};

export function reconciledTextractLineItemHints(
  result: AccountingInboxParseResult,
): AccountingReviewLineItemHint[] {
  const evidence = result.textractEvidence;
  if (
    !evidence ||
    evidence.lineItemsReconcileToSubtotal !== true ||
    evidence.lineItemHintsTruncated === true
  ) {
    return [];
  }

  const hints = (evidence.lineItemHints ?? [])
    .filter((hint) => Number.isInteger(hint.priceCents) && hint.priceCents > 0)
    .map((hint) => ({
      description: hint.description?.trim() || null,
      priceCents: hint.priceCents,
      confidence: hint.confidence ?? null,
    }));
  if (!hints.length) return [];
  if (
    evidence.lineItemPriceCount != null &&
    evidence.lineItemPriceCount !== hints.length
  ) {
    return [];
  }

  const subtotalCents = result.subtotalCents;
  if (subtotalCents == null) return [];
  const hintTotalCents = hints.reduce(
    (sum, hint) => sum + hint.priceCents,
    0,
  );
  return hintTotalCents === subtotalCents ? hints : [];
}

export const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

export const toCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const toDollars = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toFixed(2);

export const makeReviewKey = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function latestParse(
  item: AccountingInboxItem,
): AccountingInboxParseResult {
  return item.artifact.parseRuns[0]?.resultJson ?? {};
}
