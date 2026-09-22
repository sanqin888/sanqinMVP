import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';

export type AccountingExpenseSplitWrite = {
  categoryDbId: string;
  paidFromAccountDbId?: string | null;
  amountCents: number;
  taxCents: number;
  sortOrder: number;
};

export async function deleteAccountingExpenseSplitsInTx(
  tx: Prisma.TransactionClient,
  expenseDocumentDbId: string,
) {
  await tx.accountingExpenseSplit.deleteMany({
    where: { expenseDocumentId: expenseDocumentDbId },
  });
}

export async function createAccountingExpenseSplitsInTx(
  tx: Prisma.TransactionClient,
  input: {
    expenseDocumentDbId: string;
    splits: AccountingExpenseSplitWrite[];
  },
) {
  const expenseSplitRows = input.splits.map((split) => ({
    splitStableId: `expensesplit_${createId()}`,
    expenseDocumentId: input.expenseDocumentDbId,
    categoryId: split.categoryDbId,
    paidFromAccountId: split.paidFromAccountDbId ?? null,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
    sortOrder: split.sortOrder,
  }));
  if (expenseSplitRows.length) {
    await tx.accountingExpenseSplit.createMany({ data: expenseSplitRows });
  }

  return expenseSplitRows;
}

export async function assignAccountingExpenseSplitFundingInTx(
  tx: Prisma.TransactionClient,
  input: {
    expenseSplitDbId: string;
    expenseDocumentDbId: string;
    paidFromAccountDbId: string;
  },
) {
  return tx.accountingExpenseSplit.updateMany({
    where: {
      id: input.expenseSplitDbId,
      expenseDocumentId: input.expenseDocumentDbId,
      paidFromAccountId: null,
    },
    data: {
      paidFromAccountId: input.paidFromAccountDbId,
    },
  });
}
