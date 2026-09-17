import { Prisma } from '@prisma/client';
import type { AccountingDocumentStatus } from './accounting-contracts';
import type { AccountingDb } from './accounting-db';

const ACCOUNTING_DOCUMENT_SELECT = {
  documentStableId: true,
  source: true,
  status: true,
  occurredAt: true,
  subtotalCents: true,
  taxCents: true,
  totalCents: true,
  currency: true,
  emailSubject: true,
  attachmentUrls: true,
  extractedText: true,
  extractionJson: true,
  memo: true,
  createdAt: true,
  confirmedAt: true,
  paymentAllocations: {
    select: {
      paymentAllocationStableId: true,
      amountCents: true,
      sortOrder: true,
      account: {
        select: {
          accountStableId: true,
          name: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  transactions: {
    where: { deletedAt: null },
    select: {
      txStableId: true,
      amountCents: true,
      taxCents: true,
      category: {
        select: { categoryStableId: true, name: true },
      },
    },
  },
} satisfies Prisma.AccountingExpenseDocumentSelect;

type AccountingDocumentRow = Prisma.AccountingExpenseDocumentGetPayload<{
  select: typeof ACCOUNTING_DOCUMENT_SELECT;
}>;

export async function listAccountingExpenseDocuments(
  db: AccountingDb,
  params: {
    status?: AccountingDocumentStatus;
    limit?: number;
    startAt?: Date | null;
  },
) {
  const take = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const rows = await db.accountingExpenseDocument.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.startAt
        ? {
            OR: [{ occurredAt: null }, { occurredAt: { gte: params.startAt } }],
          }
        : {}),
    },
    select: ACCOUNTING_DOCUMENT_SELECT,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map(presentAccountingExpenseDocument);
}

export async function readAccountingExpenseDocument(
  db: AccountingDb,
  documentStableId: string,
) {
  const row = await db.accountingExpenseDocument.findUnique({
    where: { documentStableId },
    select: ACCOUNTING_DOCUMENT_SELECT,
  });
  return row ? presentAccountingExpenseDocument(row) : null;
}

function presentAccountingExpenseDocument(row: AccountingDocumentRow) {
  return {
    documentStableId: row.documentStableId,
    source: row.source,
    status: row.status,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    currency: row.currency,
    emailSubject: row.emailSubject,
    attachmentUrls: row.attachmentUrls,
    extractedText: row.extractedText?.slice(0, 20_000) ?? null,
    extraction: row.extractionJson,
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    paymentAllocations: row.paymentAllocations.map((allocation) => ({
      paymentAllocationStableId: allocation.paymentAllocationStableId,
      accountStableId: allocation.account.accountStableId,
      accountName: allocation.account.name,
      amountCents: allocation.amountCents,
      sortOrder: allocation.sortOrder,
    })),
    splits: row.transactions.map((tx) => ({
      txStableId: tx.txStableId,
      categoryStableId: tx.category.categoryStableId,
      categoryName: tx.category.name,
      amountCents: tx.amountCents,
      taxCents: tx.taxCents,
    })),
  };
}
