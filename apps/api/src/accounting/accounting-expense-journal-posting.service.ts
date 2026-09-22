import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AccountingDocumentStatus } from './accounting-contracts';
import {
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  type CanonicalExpenseFactV1,
} from './accounting-expense-journal.policy';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { buildCanonicalExpenseJournalWritePlan } from './accounting-expense-journal-write-authority';
import { AccountingJournalService } from './accounting-journal.service';

type PersistedExpensePostingFact = {
  documentStableId: string;
  status: AccountingDocumentStatus;
  occurredAt: Date | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string;
  memo: string | null;
  splits: Array<{
    splitStableId: string;
    amountCents: number;
    taxCents: number;
    category: { categoryStableId: string };
  }>;
  paymentAllocations: Array<{
    paymentAllocationStableId: string;
    amountCents: number;
    account: { accountStableId: string };
  }>;
};

const buildFact = (
  document: PersistedExpensePostingFact,
): CanonicalExpenseFactV1 => {
  if (
    !document.occurredAt ||
    document.subtotalCents == null ||
    document.taxCents == null ||
    document.totalCents == null
  ) {
    throw new ConflictException(
      'confirmed expense document is missing canonical booking facts',
    );
  }

  return {
    version: 1,
    documentStableId: document.documentStableId,
    occurredAt: document.occurredAt.toISOString(),
    currency: document.currency,
    subtotalCents: document.subtotalCents,
    taxCents: document.taxCents,
    totalCents: document.totalCents,
    memo: document.memo,
    splits: document.splits.map((split) => ({
      categoryStableId: split.category.categoryStableId,
      amountCents: split.amountCents,
      taxCents: split.taxCents,
    })),
    paymentAllocations: document.paymentAllocations.map((allocation) => ({
      accountStableId: allocation.account.accountStableId,
      amountCents: allocation.amountCents,
    })),
  };
};

@Injectable()
export class AccountingExpenseJournalPostingService {
  constructor(private readonly journal: AccountingJournalService) {}

  async postConfirmedExpenseIfReadyInTx(
    tx: Prisma.TransactionClient,
    documentStableId: string,
    operatorActorRef: string,
  ) {
    const document = await tx.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: {
        documentStableId: true,
        status: true,
        occurredAt: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        currency: true,
        memo: true,
        splits: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            splitStableId: true,
            amountCents: true,
            taxCents: true,
            category: { select: { categoryStableId: true } },
          },
        },
        paymentAllocations: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            paymentAllocationStableId: true,
            amountCents: true,
            account: { select: { accountStableId: true } },
          },
        },
      },
    });
    if (!document) throw new NotFoundException('expense document not found');
    if (document.status !== AccountingDocumentStatus.CONFIRMED) {
      throw new ConflictException('expense document is not confirmed');
    }

    if (document.paymentAllocations.length === 0) {
      return null;
    }

    let plan: ReturnType<typeof buildCanonicalExpenseJournalWritePlan>;
    try {
      plan = buildCanonicalExpenseJournalWritePlan({
        fact: buildFact(document),
        splitStableIds: document.splits.map((row) => row.splitStableId),
        paymentAllocationStableIds: document.paymentAllocations.map(
          (row) => row.paymentAllocationStableId,
        ),
      });
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    if (
      plan.journal.sourceFactType !== CANONICAL_EXPENSE_SOURCE_FACT_TYPE ||
      plan.journal.sourceFactStableId !== documentStableId
    ) {
      throw new ConflictException(
        'canonical Expense posting plan has inconsistent source authority',
      );
    }

    return this.journal.createCanonicalExpenseJournalEntryInTx(
      plan.journal,
      operatorActorRef,
      plan.authority,
      tx,
    );
  }
}
