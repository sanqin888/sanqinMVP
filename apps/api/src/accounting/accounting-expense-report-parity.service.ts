import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingDocumentStatus,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { CANONICAL_EXPENSE_SOURCE_FACT_TYPE } from './accounting-expense-journal.policy';
import { compareAccountingExpenseSplitPersistence } from './accounting-expense-split-parity';
import { classifyAccountingCashflowContext } from './accounting-financial-report-policy';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import { AccountingPeriodService } from './accounting-period.service';

type MoneyMap = Map<string, number>;

type ExpenseParityBlockCode =
  | 'PARTIAL_RANGE_NOT_CUTOVER_EVIDENCE'
  | 'NO_CONFIRMED_EXPENSE_EVIDENCE'
  | 'SPLIT_PERSISTENCE_MISMATCH'
  | 'MISSING_PAYMENT_ALLOCATION'
  | 'MISSING_CANONICAL_JOURNAL'
  | 'DUPLICATE_CANONICAL_JOURNAL'
  | 'ORPHAN_CANONICAL_JOURNAL'
  | 'UNEXPECTED_EXPENSE_JOURNAL_AUTHORITY'
  | 'PNL_MISMATCH'
  | 'INPUT_TAX_MISMATCH'
  | 'ACCOUNT_MOVEMENT_MISMATCH'
  | 'CASHFLOW_MISMATCH';

const addMoney = (map: MoneyMap, key: string, cents: number): void => {
  map.set(key, (map.get(key) ?? 0) + cents);
};

const sortedMap = (map: MoneyMap) =>
  Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, amountCents]) => ({ key, amountCents }));

const diffMoneyMaps = (legacy: MoneyMap, journal: MoneyMap) => {
  const keys = [...new Set([...legacy.keys(), ...journal.keys()])].sort();
  return keys
    .map((key) => {
      const legacyCents = legacy.get(key) ?? 0;
      const journalCents = journal.get(key) ?? 0;
      return {
        key,
        legacyCents,
        journalCents,
        deltaCents: journalCents - legacyCents,
      };
    })
    .filter((row) => row.deltaCents !== 0);
};

const isCashAccount = (type: AccountingAccountType | null) =>
  type === AccountingAccountType.CASH || type === AccountingAccountType.BANK;

@Injectable()
export class AccountingExpenseReportParityService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async preview(input: { from?: string; to?: string }) {
    const { fromDate, toDate, timezone, accountingStartAt, fullCutoverRange } =
      await this.resolveRange(input.from, input.to);
    const occurredAt = this.occurredAtWhere(fromDate, toDate);

    const [documents, journalEntries] = await Promise.all([
      this.prisma.accountingExpenseDocument.findMany({
        where: {
          status: AccountingDocumentStatus.CONFIRMED,
          ...(occurredAt ? { occurredAt } : {}),
        },
        select: {
          documentStableId: true,
          occurredAt: true,
          currency: true,
          memo: true,
          transactions: {
            where: { deletedAt: null },
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
            select: {
              txStableId: true,
              type: true,
              amountCents: true,
              taxCents: true,
              memo: true,
              category: {
                select: {
                  categoryStableId: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
          splits: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
              amountCents: true,
              taxCents: true,
              category: { select: { categoryStableId: true } },
            },
          },
          paymentAllocations: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
              amountCents: true,
              account: {
                select: {
                  accountStableId: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.accountingJournalEntry.findMany({
        where: {
          deletedAt: null,
          source: AccountingJournalSource.EXPENSE_DOCUMENT,
          ...(occurredAt ? { occurredAt } : {}),
        },
        select: {
          entryStableId: true,
          sourceFactType: true,
          sourceFactStableId: true,
          sourceFactVersion: true,
          occurredAt: true,
          currency: true,
          memo: true,
          lines: {
            orderBy: { lineNo: 'asc' },
            select: {
              lineNo: true,
              debitCents: true,
              creditCents: true,
              memo: true,
              account: {
                select: {
                  accountStableId: true,
                  name: true,
                  type: true,
                  accountClass: true,
                },
              },
              category: {
                select: { categoryStableId: true, name: true, type: true },
              },
            },
          },
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const blockReasons: Array<{
      code: ExpenseParityBlockCode;
      documentStableId: string | null;
      message: string;
    }> = [];
    const canonicalJournalEntries = journalEntries.filter((entry) => {
      if (
        entry.sourceFactType === CANONICAL_EXPENSE_SOURCE_FACT_TYPE &&
        entry.sourceFactVersion === 1
      ) {
        return true;
      }
      blockReasons.push({
        code: 'UNEXPECTED_EXPENSE_JOURNAL_AUTHORITY',
        documentStableId: entry.sourceFactStableId?.trim() || null,
        message:
          'Expense-document Journal does not use the canonical Expense v1 authority',
      });
      return false;
    });
    const journalsByDocument = new Map<
      string,
      (typeof canonicalJournalEntries)[number][]
    >();
    for (const entry of canonicalJournalEntries) {
      const stableId = entry.sourceFactStableId?.trim();
      if (!stableId) continue;
      const existing = journalsByDocument.get(stableId) ?? [];
      existing.push(entry);
      journalsByDocument.set(stableId, existing);
    }

    const legacyPnl = new Map<string, number>();
    const journalPnl = new Map<string, number>();
    const legacyAccountMovement = new Map<string, number>();
    const journalAccountMovement = new Map<string, number>();
    const legacyCashflow = {
      OPERATING: 0,
      INVESTING: 0,
      FINANCING: 0,
    };
    const journalCashflow = {
      OPERATING: 0,
      INVESTING: 0,
      FINANCING: 0,
    };
    let legacyInputTaxCents = 0;
    let journalInputTaxCents = 0;
    const entries: Array<{
      documentStableId: string;
      journalEntryStableId: string | null;
      splitParity: 'MATCHED' | 'MISMATCH';
      paymentAllocationCount: number;
      journalCount: number;
    }> = [];

    const documentIds = new Set(
      documents.map((document) => document.documentStableId),
    );

    for (const document of documents) {
      const splitParity = compareAccountingExpenseSplitPersistence(
        document.transactions.map((transaction) => ({
          categoryStableId: transaction.category.categoryStableId,
          amountCents: transaction.amountCents,
          taxCents: transaction.taxCents,
        })),
        document.splits.map((split) => ({
          categoryStableId: split.category.categoryStableId,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
        })),
      );
      if (splitParity.status === 'MISMATCH') {
        blockReasons.push({
          code: 'SPLIT_PERSISTENCE_MISMATCH',
          documentStableId: document.documentStableId,
          message:
            'Expense-owned split facts do not match the legacy report compatibility copy',
        });
      }

      const legacyDocumentPnl = new Map<string, number>();
      const legacyDocumentAccountMovement = new Map<string, number>();
      const legacyDocumentCashflow = {
        OPERATING: 0,
        INVESTING: 0,
        FINANCING: 0,
      };
      let legacyDocumentInputTaxCents = 0;

      for (const transaction of document.transactions) {
        if (transaction.type !== AccountingTxType.EXPENSE) continue;
        addMoney(
          legacyDocumentPnl,
          transaction.category.categoryStableId,
          transaction.amountCents,
        );
        addMoney(
          legacyPnl,
          transaction.category.categoryStableId,
          transaction.amountCents,
        );
        legacyDocumentInputTaxCents += transaction.taxCents;
        legacyInputTaxCents += transaction.taxCents;
      }

      for (const allocation of document.paymentAllocations) {
        addMoney(
          legacyDocumentAccountMovement,
          allocation.account.accountStableId,
          -allocation.amountCents,
        );
        addMoney(
          legacyAccountMovement,
          allocation.account.accountStableId,
          -allocation.amountCents,
        );
        if (!isCashAccount(allocation.account.type)) continue;
        const bucket = classifyAccountingCashflowContext([
          document.memo,
          allocation.account.name,
          ...document.transactions.flatMap((transaction) => [
            transaction.memo,
            transaction.category.name,
          ]),
        ]);
        legacyDocumentCashflow[bucket] -= allocation.amountCents;
        legacyCashflow[bucket] -= allocation.amountCents;
      }

      const journals = journalsByDocument.get(document.documentStableId) ?? [];
      entries.push({
        documentStableId: document.documentStableId,
        journalEntryStableId:
          journals.length === 1 ? journals[0].entryStableId : null,
        splitParity: splitParity.status,
        paymentAllocationCount: document.paymentAllocations.length,
        journalCount: journals.length,
      });

      if (document.paymentAllocations.length === 0) {
        blockReasons.push({
          code: 'MISSING_PAYMENT_ALLOCATION',
          documentStableId: document.documentStableId,
          message:
            'Confirmed Expense is intentionally unposted until reviewed payment allocation is completed',
        });
      }
      if (journals.length === 0) {
        blockReasons.push({
          code: 'MISSING_CANONICAL_JOURNAL',
          documentStableId: document.documentStableId,
          message:
            'Confirmed Expense has no canonical Expense Journal for report cutover',
        });
        continue;
      }
      if (journals.length > 1) {
        blockReasons.push({
          code: 'DUPLICATE_CANONICAL_JOURNAL',
          documentStableId: document.documentStableId,
          message:
            'Confirmed Expense has more than one active canonical Expense Journal',
        });
        continue;
      }

      const journal = journals[0];
      const journalDocumentPnl = new Map<string, number>();
      const journalDocumentAccountMovement = new Map<string, number>();
      const journalDocumentCashflow = {
        OPERATING: 0,
        INVESTING: 0,
        FINANCING: 0,
      };
      let journalDocumentInputTaxCents = 0;

      for (const line of journal.lines) {
        if (line.account.accountClass === AccountingAccountClass.EXPENSE) {
          const categoryStableId =
            line.category?.categoryStableId ?? 'expense_other';
          const amountCents = line.debitCents - line.creditCents;
          addMoney(journalDocumentPnl, categoryStableId, amountCents);
          addMoney(journalPnl, categoryStableId, amountCents);
        }
        if (line.account.accountStableId === 'account_hst_recoverable') {
          const inputTaxCents = line.debitCents - line.creditCents;
          journalDocumentInputTaxCents += inputTaxCents;
          journalInputTaxCents += inputTaxCents;
        }
        if (line.account.type) {
          const amountCents = line.debitCents - line.creditCents;
          addMoney(
            journalDocumentAccountMovement,
            line.account.accountStableId,
            amountCents,
          );
          addMoney(
            journalAccountMovement,
            line.account.accountStableId,
            amountCents,
          );
        }
      }

      const cashMovementCents = journal.lines.reduce(
        (sum, line) =>
          isCashAccount(line.account.type)
            ? sum + line.debitCents - line.creditCents
            : sum,
        0,
      );
      if (cashMovementCents !== 0) {
        const bucket = classifyAccountingCashflowContext([
          journal.memo,
          ...journal.lines.flatMap((line) => [
            line.memo,
            line.category?.name,
            line.account.name,
          ]),
        ]);
        journalDocumentCashflow[bucket] += cashMovementCents;
        journalCashflow[bucket] += cashMovementCents;
      }

      if (diffMoneyMaps(legacyDocumentPnl, journalDocumentPnl).length) {
        blockReasons.push({
          code: 'PNL_MISMATCH',
          documentStableId: document.documentStableId,
          message:
            'Legacy Expense P&L does not match its canonical Expense Journal',
        });
      }
      if (journalDocumentInputTaxCents !== legacyDocumentInputTaxCents) {
        blockReasons.push({
          code: 'INPUT_TAX_MISMATCH',
          documentStableId: document.documentStableId,
          message:
            'Legacy Expense recoverable tax does not match its canonical Expense Journal',
        });
      }
      if (
        diffMoneyMaps(
          legacyDocumentAccountMovement,
          journalDocumentAccountMovement,
        ).length
      ) {
        blockReasons.push({
          code: 'ACCOUNT_MOVEMENT_MISMATCH',
          documentStableId: document.documentStableId,
          message:
            'Legacy Expense payment-account movement does not match its canonical Expense Journal',
        });
      }
      if (
        journalDocumentCashflow.OPERATING !==
          legacyDocumentCashflow.OPERATING ||
        journalDocumentCashflow.INVESTING !==
          legacyDocumentCashflow.INVESTING ||
        journalDocumentCashflow.FINANCING !== legacyDocumentCashflow.FINANCING
      ) {
        blockReasons.push({
          code: 'CASHFLOW_MISMATCH',
          documentStableId: document.documentStableId,
          message:
            'Legacy Expense cashflow does not match its canonical Expense Journal',
        });
      }
    }

    for (const journal of canonicalJournalEntries) {
      const stableId = journal.sourceFactStableId?.trim();
      if (!stableId || !documentIds.has(stableId)) {
        blockReasons.push({
          code: 'ORPHAN_CANONICAL_JOURNAL',
          documentStableId: stableId || null,
          message:
            'Canonical Expense Journal has no matching confirmed Expense in the reviewed range',
        });
      }
    }

    if (!fullCutoverRange) {
      blockReasons.push({
        code: 'PARTIAL_RANGE_NOT_CUTOVER_EVIDENCE',
        documentStableId: null,
        message:
          'Cutover evidence must cover the full canonical Accounting range from accountingStartDate with no upper bound',
      });
    }

    if (documents.length === 0) {
      blockReasons.push({
        code: 'NO_CONFIRMED_EXPENSE_EVIDENCE',
        documentStableId: null,
        message:
          'At least one confirmed Expense is required before report cutover can be production-verified',
      });
    }

    const pnlDeltas = diffMoneyMaps(legacyPnl, journalPnl);
    if (pnlDeltas.length) {
      blockReasons.push({
        code: 'PNL_MISMATCH',
        documentStableId: null,
        message: 'Legacy Expense P&L does not match canonical Expense Journals',
      });
    }
    const inputTaxDeltaCents = journalInputTaxCents - legacyInputTaxCents;
    if (inputTaxDeltaCents !== 0) {
      blockReasons.push({
        code: 'INPUT_TAX_MISMATCH',
        documentStableId: null,
        message:
          'Legacy Expense recoverable tax does not match canonical Expense Journals',
      });
    }
    const accountMovementDeltas = diffMoneyMaps(
      legacyAccountMovement,
      journalAccountMovement,
    );
    if (accountMovementDeltas.length) {
      blockReasons.push({
        code: 'ACCOUNT_MOVEMENT_MISMATCH',
        documentStableId: null,
        message:
          'Legacy Expense payment-account movement does not match canonical Expense Journals',
      });
    }
    const cashflowDeltas = {
      operatingCents: journalCashflow.OPERATING - legacyCashflow.OPERATING,
      investingCents: journalCashflow.INVESTING - legacyCashflow.INVESTING,
      financingCents: journalCashflow.FINANCING - legacyCashflow.FINANCING,
    };
    if (
      cashflowDeltas.operatingCents !== 0 ||
      cashflowDeltas.investingCents !== 0 ||
      cashflowDeltas.financingCents !== 0
    ) {
      blockReasons.push({
        code: 'CASHFLOW_MISMATCH',
        documentStableId: null,
        message:
          'Legacy Expense cashflow does not match canonical Expense Journals',
      });
    }

    const reportWithoutHash = {
      version: 1 as const,
      range: {
        timezone,
        accountingStartAt: accountingStartAt.toISOString(),
        from: input.from ?? null,
        to: input.to ?? null,
        fromInclusive: fromDate.toISOString(),
        toInclusive: toDate?.toISOString() ?? null,
        fullCutoverRange,
      },
      counts: {
        confirmedExpenses: documents.length,
        canonicalExpenseJournals: canonicalJournalEntries.length,
        blockingReasons: blockReasons.length,
      },
      cutoverReady: blockReasons.length === 0,
      pnl: {
        legacyByCategory: sortedMap(legacyPnl),
        journalByCategory: sortedMap(journalPnl),
        deltas: pnlDeltas,
      },
      inputTax: {
        legacyCents: legacyInputTaxCents,
        journalCents: journalInputTaxCents,
        deltaCents: inputTaxDeltaCents,
      },
      accountMovement: {
        legacyByAccount: sortedMap(legacyAccountMovement),
        journalByAccount: sortedMap(journalAccountMovement),
        deltas: accountMovementDeltas,
      },
      cashflow: {
        legacy: {
          operatingCents: legacyCashflow.OPERATING,
          investingCents: legacyCashflow.INVESTING,
          financingCents: legacyCashflow.FINANCING,
        },
        journal: {
          operatingCents: journalCashflow.OPERATING,
          investingCents: journalCashflow.INVESTING,
          financingCents: journalCashflow.FINANCING,
        },
        deltas: cashflowDeltas,
      },
      entries,
      blockReasons,
    };

    return {
      ...reportWithoutHash,
      parityHash: hashAccountingJson(reportWithoutHash),
    };
  }

  private async resolveRange(from?: string, to?: string) {
    const timezone = await this.period.getBusinessTimezone();
    const accountingStartAt =
      await this.period.requireCanonicalFinancialPostingStartAt();
    const requestedFrom = this.parseDate(from, false, timezone);
    const fromDate =
      requestedFrom && requestedFrom > accountingStartAt
        ? requestedFrom
        : accountingStartAt;
    const toDate = this.parseDate(to, true, timezone);
    if (toDate && toDate < fromDate) {
      throw new BadRequestException('report range ends before it starts');
    }
    return {
      timezone,
      accountingStartAt,
      fromDate,
      toDate,
      fullCutoverRange:
        fromDate.getTime() === accountingStartAt.getTime() && !to,
    };
  }

  private occurredAtWhere(fromDate?: Date, toDate?: Date) {
    if (!fromDate && !toDate) return undefined;
    return {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  private parseDate(
    raw: string | undefined,
    endOfDay: boolean,
    timezone?: string,
  ) {
    if (!raw) return undefined;
    if (raw.length <= 10 && timezone) {
      const parsed = DateTime.fromISO(raw, { zone: timezone });
      if (!parsed.isValid || parsed.toISODate() !== raw) {
        throw new BadRequestException(`Invalid date: ${raw}`);
      }
      const bounded = endOfDay ? parsed.endOf('day') : parsed.startOf('day');
      return bounded.toUTC().toJSDate();
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    return parsed;
  }
}
