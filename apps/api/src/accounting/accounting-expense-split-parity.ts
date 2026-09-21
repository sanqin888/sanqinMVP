import { hashAccountingJson } from './accounting-inbox-core.policy';

export type AccountingExpenseSplitProjection = {
  categoryStableId: string;
  amountCents: number;
  taxCents: number;
};

const normalizeExpenseSplitProjection = (
  splits: AccountingExpenseSplitProjection[],
): AccountingExpenseSplitProjection[] =>
  splits
    .map((split) => ({ ...split }))
    .sort(
      (left, right) =>
        left.categoryStableId.localeCompare(right.categoryStableId) ||
        left.amountCents - right.amountCents ||
        left.taxCents - right.taxCents,
    );

export const compareAccountingExpenseSplitPersistence = (
  legacySplits: AccountingExpenseSplitProjection[],
  expenseSplits: AccountingExpenseSplitProjection[],
) => {
  const normalizedLegacy = normalizeExpenseSplitProjection(legacySplits);
  const normalizedExpenseSplits =
    normalizeExpenseSplitProjection(expenseSplits);
  const legacyHash = hashAccountingJson(normalizedLegacy);
  const expenseSplitHash = hashAccountingJson(normalizedExpenseSplits);
  return {
    status:
      legacyHash === expenseSplitHash
        ? ('MATCHED' as const)
        : ('MISMATCH' as const),
    legacyCount: normalizedLegacy.length,
    expenseSplitCount: normalizedExpenseSplits.length,
    legacyHash,
    expenseSplitHash,
  };
};
