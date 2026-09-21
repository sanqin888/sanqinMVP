import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  AccountingDocumentStatus,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  buildCanonicalExpenseJournal,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CanonicalExpenseJournalPolicyError,
  type CanonicalExpenseJournalPolicyErrorCode,
  type CanonicalExpenseFactV1,
} from './accounting-expense-journal.policy';
import {
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import { AccountingPeriodService } from './accounting-period.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PREVIEW_RANGE_DAYS = 370;

export type CanonicalExpensePreviewBlockCode =
  | 'INCOMPLETE_DOCUMENT'
  | CanonicalExpenseJournalPolicyErrorCode;

export type CanonicalExpensePreviewClassification =
  | 'READY'
  | 'ALREADY_POSTED'
  | CanonicalExpensePreviewBlockCode;

export type CanonicalExpenseShadowEntry = {
  documentStableId: string;
  occurredAt: string;
  currency: string;
  status: 'READY' | 'BLOCKED' | 'ALREADY_POSTED';
  classification: CanonicalExpensePreviewClassification;
  blockReasons: Array<{
    code: CanonicalExpensePreviewBlockCode;
    message: string;
  }>;
  legacy: {
    splitCount: number;
    paymentAllocationCount: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number | null;
    paymentAllocatedCents: number;
  };
  existingJournal: {
    entryStableId: string;
    idempotencyKey: string;
  } | null;
  draftJournal: AccountingJournalCreateInput | null;
  draftHash: string | null;
  debitCents: number;
  creditCents: number;
};

export type CanonicalExpenseShadowPreviewReport = {
  version: 1;
  planHash: string;
  range: {
    timezone: string;
    accountingStartAt: string;
    fromDate: string;
    toDateExclusive: string;
    fromInclusive: string;
    toExclusive: string;
  };
  counts: {
    candidates: number;
    ready: number;
    blocked: number;
    alreadyPosted: number;
    byClassification: Record<string, number>;
  };
  amounts: {
    readyDebitCents: number;
    readyCreditCents: number;
  };
  entries: CanonicalExpenseShadowEntry[];
};

export type CanonicalExpenseShadowPreviewInput = {
  fromDate?: string;
  toDateExclusive: string;
};

const parseLocalDate = (
  raw: string,
  timezone: string,
  field: string,
): DateTime => {
  if (!ISO_DATE.test(raw)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const value = DateTime.fromISO(raw, { zone: timezone }).startOf('day');
  if (!value.isValid || value.toISODate() !== raw) {
    throw new BadRequestException(`Invalid ${field}: ${raw}`);
  }
  return value;
};

const sumSafe = (values: number[], field: string): number => {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new BadRequestException(`${field} must use safe integer cents`);
    }
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new BadRequestException(`${field} exceeds safe integer range`);
    }
  }
  return total;
};

const journalTotals = (journal: AccountingJournalCreateInput | null) => {
  if (!journal) return { debitCents: 0, creditCents: 0 };
  return journal.lines.reduce(
    (totals, line) => ({
      debitCents: totals.debitCents + (line.debitCents ?? 0),
      creditCents: totals.creditCents + (line.creditCents ?? 0),
    }),
    { debitCents: 0, creditCents: 0 },
  );
};

@Injectable()
export class AccountingExpenseJournalPreviewService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async previewRange(
    input: CanonicalExpenseShadowPreviewInput,
  ): Promise<CanonicalExpenseShadowPreviewReport> {
    const accountingStartAt =
      await this.period.requireCanonicalFinancialPostingStartAt();
    const timezone = await this.period.getBusinessTimezone();
    const startDate = DateTime.fromJSDate(accountingStartAt, {
      zone: timezone,
    }).toISODate();
    if (!startDate) {
      throw new BadRequestException('Unable to resolve accounting start date');
    }

    const fromDate = input.fromDate?.trim() || startDate;
    const toDateExclusive = input.toDateExclusive.trim();
    if (!toDateExclusive) {
      throw new BadRequestException('toDateExclusive is required');
    }
    const fromLocal = parseLocalDate(fromDate, timezone, 'fromDate');
    const toLocal = parseLocalDate(
      toDateExclusive,
      timezone,
      'toDateExclusive',
    );
    const fromInclusive = fromLocal.toUTC().toJSDate();
    const toExclusive = toLocal.toUTC().toJSDate();
    if (fromInclusive < accountingStartAt) {
      throw new BadRequestException(
        `fromDate cannot be before accounting start ${startDate}`,
      );
    }
    if (toExclusive <= fromInclusive) {
      throw new BadRequestException('toDateExclusive must be after fromDate');
    }
    if (toLocal.diff(fromLocal, 'days').days > MAX_PREVIEW_RANGE_DAYS) {
      throw new BadRequestException(
        `Shadow preview range cannot exceed ${MAX_PREVIEW_RANGE_DAYS} days`,
      );
    }

    const documents = await this.prisma.accountingExpenseDocument.findMany({
      where: {
        status: AccountingDocumentStatus.CONFIRMED,
        occurredAt: { gte: fromInclusive, lt: toExclusive },
      },
      orderBy: [{ occurredAt: 'asc' }, { documentStableId: 'asc' }],
      select: {
        documentStableId: true,
        occurredAt: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        currency: true,
        memo: true,
        paymentAllocations: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            amountCents: true,
            account: { select: { accountStableId: true } },
          },
        },
        transactions: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { txStableId: 'asc' }],
          select: {
            amountCents: true,
            taxCents: true,
            category: { select: { categoryStableId: true } },
          },
        },
      },
    });

    const stableIds = documents.map((document) => document.documentStableId);
    const existingJournals = stableIds.length
      ? await this.prisma.accountingJournalEntry.findMany({
          where: {
            deletedAt: null,
            source: AccountingJournalSource.EXPENSE_DOCUMENT,
            sourceFactType: CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
            sourceFactStableId: { in: stableIds },
          },
          select: {
            entryStableId: true,
            idempotencyKey: true,
            sourceFactStableId: true,
          },
        })
      : [];
    const journalByDocument = new Map(
      existingJournals.flatMap((entry) =>
        entry.sourceFactStableId
          ? [[entry.sourceFactStableId, entry] as const]
          : [],
      ),
    );

    const entries: CanonicalExpenseShadowEntry[] = documents.map((document) => {
      const existingJournal = journalByDocument.get(document.documentStableId);
      const legacy = {
        splitCount: document.transactions.length,
        paymentAllocationCount: document.paymentAllocations.length,
        subtotalCents: sumSafe(
          document.transactions.map((tx) => tx.amountCents),
          'legacy subtotal',
        ),
        taxCents: sumSafe(
          document.transactions.map((tx) => tx.taxCents),
          'legacy tax',
        ),
        totalCents: document.totalCents,
        paymentAllocatedCents: sumSafe(
          document.paymentAllocations.map(
            (allocation) => allocation.amountCents,
          ),
          'legacy payment allocations',
        ),
      };

      if (existingJournal) {
        return {
          documentStableId: document.documentStableId,
          occurredAt: document.occurredAt?.toISOString() ?? '',
          currency: document.currency,
          status: 'ALREADY_POSTED' as const,
          classification: 'ALREADY_POSTED' as const,
          blockReasons: [],
          legacy,
          existingJournal: {
            entryStableId: existingJournal.entryStableId,
            idempotencyKey: existingJournal.idempotencyKey,
          },
          draftJournal: null,
          draftHash: null,
          debitCents: 0,
          creditCents: 0,
        };
      }

      if (
        !document.occurredAt ||
        document.subtotalCents == null ||
        document.taxCents == null ||
        document.totalCents == null
      ) {
        return {
          documentStableId: document.documentStableId,
          occurredAt: document.occurredAt?.toISOString() ?? '',
          currency: document.currency,
          status: 'BLOCKED' as const,
          classification: 'INCOMPLETE_DOCUMENT' as const,
          blockReasons: [
            {
              code: 'INCOMPLETE_DOCUMENT' as const,
              message:
                'confirmed Expense document is missing occurredAt/subtotal/tax/total evidence',
            },
          ],
          legacy,
          existingJournal: null,
          draftJournal: null,
          draftHash: null,
          debitCents: 0,
          creditCents: 0,
        };
      }

      const fact: CanonicalExpenseFactV1 = {
        version: 1,
        documentStableId: document.documentStableId,
        occurredAt: document.occurredAt.toISOString(),
        currency: document.currency,
        subtotalCents: document.subtotalCents,
        taxCents: document.taxCents,
        totalCents: document.totalCents,
        memo: document.memo,
        splits: document.transactions.map((tx) => ({
          categoryStableId: tx.category.categoryStableId,
          amountCents: tx.amountCents,
          taxCents: tx.taxCents,
        })),
        paymentAllocations: document.paymentAllocations.map((allocation) => ({
          accountStableId: allocation.account.accountStableId,
          amountCents: allocation.amountCents,
        })),
      };

      try {
        const draftJournal = buildCanonicalExpenseJournal(fact);
        const normalized = normalizeJournalCreate(draftJournal);
        const draftHash = hashJournalCreatePayload(normalized);
        const totals = journalTotals(draftJournal);
        return {
          documentStableId: document.documentStableId,
          occurredAt: fact.occurredAt,
          currency: fact.currency,
          status: 'READY' as const,
          classification: 'READY' as const,
          blockReasons: [],
          legacy,
          existingJournal: null,
          draftJournal,
          draftHash,
          debitCents: totals.debitCents,
          creditCents: totals.creditCents,
        };
      } catch (error) {
        if (!(error instanceof CanonicalExpenseJournalPolicyError)) {
          throw error;
        }
        return {
          documentStableId: document.documentStableId,
          occurredAt: fact.occurredAt,
          currency: fact.currency,
          status: 'BLOCKED' as const,
          classification: error.code,
          blockReasons: [{ code: error.code, message: error.message }],
          legacy,
          existingJournal: null,
          draftJournal: null,
          draftHash: null,
          debitCents: 0,
          creditCents: 0,
        };
      }
    });

    const byClassification: Record<string, number> = {};
    let readyDebitCents = 0;
    let readyCreditCents = 0;
    for (const entry of entries) {
      byClassification[entry.classification] =
        (byClassification[entry.classification] ?? 0) + 1;
      if (entry.status === 'READY') {
        readyDebitCents = sumSafe(
          [readyDebitCents, entry.debitCents],
          'readyDebitCents',
        );
        readyCreditCents = sumSafe(
          [readyCreditCents, entry.creditCents],
          'readyCreditCents',
        );
      }
    }

    const range = {
      timezone,
      accountingStartAt: accountingStartAt.toISOString(),
      fromDate,
      toDateExclusive,
      fromInclusive: fromInclusive.toISOString(),
      toExclusive: toExclusive.toISOString(),
    };
    const reportWithoutHash = {
      version: 1 as const,
      range,
      counts: {
        candidates: entries.length,
        ready: entries.filter((entry) => entry.status === 'READY').length,
        blocked: entries.filter((entry) => entry.status === 'BLOCKED').length,
        alreadyPosted: entries.filter(
          (entry) => entry.status === 'ALREADY_POSTED',
        ).length,
        byClassification,
      },
      amounts: { readyDebitCents, readyCreditCents },
      entries,
    };
    return {
      ...reportWithoutHash,
      planHash: hashAccountingJson(reportWithoutHash),
    };
  }
}
