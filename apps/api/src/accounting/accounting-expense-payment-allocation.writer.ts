import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';

export async function createAccountingExpensePaymentAllocationsInTx(
  tx: Prisma.TransactionClient,
  expenseDocumentDbId: string,
  allocations: Array<{
    accountDbId: string;
    amountCents: number;
    sortOrder: number;
  }>,
) {
  if (!allocations.length) return;
  await tx.accountingExpensePaymentAllocation.createMany({
    data: allocations.map((allocation) => ({
      paymentAllocationStableId: `expensepay_${createId()}`,
      expenseDocumentId: expenseDocumentDbId,
      accountId: allocation.accountDbId,
      amountCents: allocation.amountCents,
      sortOrder: allocation.sortOrder,
    })),
  });
}
