import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AccountingDocumentStatus } from './accounting-contracts';
import {
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
  type CanonicalExpenseFactV1,
  type CanonicalExpenseFactV2,
} from './accounting-expense-journal.policy';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import {
  buildCanonicalExpenseJournalWritePlan,
  buildCanonicalExpenseJournalWritePlansV2,
  type CanonicalExpenseFundingAccountFactV2,
} from './accounting-expense-journal-write-authority';
import { AccountingJournalService } from './accounting-journal.service';

type PersistedExpensePostingFact = {
  documentStableId: string;
  status: AccountingDocumentStatus;
  fundingAttributionVersion: number | null;
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
    paidFromAccount: {
      accountStableId: string;
      accountClass: string;
      type: string | null;
      currency: string;
      isActive: boolean;
    } | null;
  }>;
  paymentAllocations: Array<{
    paymentAllocationStableId: string;
    amountCents: number;
    account: { accountStableId: string };
  }>;
};

const buildFactV1 = (
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

const buildFactV2 = (
  document: PersistedExpensePostingFact,
): CanonicalExpenseFactV2 => {
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
    version: 2,
    documentStableId: document.documentStableId,
    occurredAt: document.occurredAt.toISOString(),
    currency: document.currency,
    subtotalCents: document.subtotalCents,
    taxCents: document.taxCents,
    totalCents: document.totalCents,
    memo: document.memo,
    splits: document.splits.map((split) => {
      if (!split.paidFromAccount) {
        throw new ConflictException(
          'confirmed Expense v2 split is missing funding account authority',
        );
      }
      return {
        splitStableId: split.splitStableId,
        categoryStableId: split.category.categoryStableId,
        paidFromAccountStableId: split.paidFromAccount.accountStableId,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
      };
    }),
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
        fundingAttributionVersion: true,
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
            paidFromAccount: {
              select: {
                accountStableId: true,
                accountClass: true,
                type: true,
                currency: true,
                isActive: true,
              },
            },
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

    const fundingAttributionVersion = document.fundingAttributionVersion ?? 1;

    if (fundingAttributionVersion === 1) {
      if (document.paymentAllocations.length === 0) {
        return null;
      }

      let plan: ReturnType<typeof buildCanonicalExpenseJournalWritePlan>;
      try {
        plan = buildCanonicalExpenseJournalWritePlan({
          fact: buildFactV1(document),
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

    if (fundingAttributionVersion !== 2) {
      throw new ConflictException(
        `unsupported Expense funding attribution version: ${fundingAttributionVersion}`,
      );
    }
    if (document.paymentAllocations.length > 0) {
      throw new ConflictException(
        'Expense v2 cannot retain legacy document-level payment allocations',
      );
    }
    if (document.splits.some((split) => !split.paidFromAccount)) {
      return null;
    }

    const fundingAccountFactsByStableId = new Map<
      string,
      CanonicalExpenseFundingAccountFactV2
    >();
    for (const split of document.splits) {
      const account = split.paidFromAccount;
      if (!account) {
        return null;
      }
      fundingAccountFactsByStableId.set(account.accountStableId, {
        accountStableId: account.accountStableId,
        accountClass: account.accountClass,
        accountType: account.type,
        currency: account.currency,
        isActive: account.isActive,
      });
    }

    let plans: ReturnType<typeof buildCanonicalExpenseJournalWritePlansV2>;
    try {
      plans = buildCanonicalExpenseJournalWritePlansV2({
        fact: buildFactV2(document),
        fundingAccountFacts: [...fundingAccountFactsByStableId.values()],
      });
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    if (
      plans.some(
        (plan) =>
          plan.journal.sourceFactType !==
            CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2 ||
          plan.journal.sourceFactStableId !== documentStableId,
      )
    ) {
      throw new ConflictException(
        'canonical Expense v2 posting plan has inconsistent source authority',
      );
    }

    const posted = [];
    for (const plan of plans) {
      posted.push(
        await this.journal.createCanonicalExpenseJournalEntryInTx(
          plan.journal,
          operatorActorRef,
          plan.authority,
          tx,
        ),
      );
    }
    return posted;
  }
}
