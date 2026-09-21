import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { AccountingSourceType, AccountingTxType } from './accounting-contracts';

export type AccountingExpenseSplitWrite = {
  categoryDbId: string;
  amountCents: number;
  taxCents: number;
  sortOrder: number;
};

export async function deleteAccountingExpenseSplitCompatibilityInTx(
  tx: Prisma.TransactionClient,
  expenseDocumentDbId: string,
) {
  await tx.accountingExpenseSplit.deleteMany({
    where: { expenseDocumentId: expenseDocumentDbId },
  });
}

export async function createAccountingExpenseSplitCompatibilityInTx(
  tx: Prisma.TransactionClient,
  input: {
    expenseDocumentDbId: string;
    documentStableId: string;
    occurredAt: Date;
    memo: string | null;
    attachmentUrls: string[];
    operatorUserStableId: string;
    splits: AccountingExpenseSplitWrite[];
  },
) {
  const expenseSplitRows = input.splits.map((split) => ({
    splitStableId: `expensesplit_${createId()}`,
    expenseDocumentId: input.expenseDocumentDbId,
    categoryId: split.categoryDbId,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
    sortOrder: split.sortOrder,
  }));
  if (expenseSplitRows.length) {
    await tx.accountingExpenseSplit.createMany({ data: expenseSplitRows });
  }

  // @compat accounting.expense-split-ownership.v1
  // AccountingTransaction remains the temporary read/report compatibility copy
  // until ExpenseSplit parity is proven and the later Journal cutover contracts it.
  const legacyTransactionRows = input.splits.map((split) => ({
    txStableId: `accttx_${createId()}`,
    type: AccountingTxType.EXPENSE,
    source: AccountingSourceType.MANUAL,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
    currency: 'CAD',
    occurredAt: input.occurredAt,
    categoryId: split.categoryDbId,
    documentId: input.expenseDocumentDbId,
    idempotencyKey: `expense:${input.documentStableId}:${split.sortOrder}`,
    externalRef: input.documentStableId,
    memo: input.memo,
    attachmentUrls: input.attachmentUrls,
    createdByUserStableId: input.operatorUserStableId,
    updatedByUserStableId: input.operatorUserStableId,
  }));
  if (legacyTransactionRows.length) {
    await tx.accountingTransaction.createMany({ data: legacyTransactionRows });
  }

  return { expenseSplitRows, legacyTransactionRows };
}
