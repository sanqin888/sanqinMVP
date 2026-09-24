import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingJournalEntryKind } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import type {
  AccountingStatementDrillThroughPhaseV1,
  AccountingStatementJournalDrillThroughV1,
  AccountingStatementJournalEntryV1,
} from './accounting-statement-drill-through.contract';
import { accountingTrialBalanceNormalSide } from './accounting-trial-balance.policy';
import { AccountingTrialBalanceService } from './accounting-trial-balance.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class AccountingStatementDrillThroughService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly trialBalance: AccountingTrialBalanceService,
  ) {}

  async read(query: {
    accountStableId: string;
    phase: AccountingStatementDrillThroughPhaseV1;
    from?: string;
    to?: string;
    currency?: string;
    limit?: number;
    offset?: number;
  }): Promise<AccountingStatementJournalDrillThroughV1> {
    const accountStableId = query.accountStableId?.trim();
    if (!accountStableId) {
      throw new BadRequestException('accountStableId is required');
    }
    if (
      query.phase !== 'OPENING' &&
      query.phase !== 'PERIOD' &&
      query.phase !== 'CLOSING'
    ) {
      throw new BadRequestException(
        'phase must be OPENING, PERIOD, or CLOSING',
      );
    }

    const limit = this.resolveLimit(query.limit);
    const offset = query.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('offset must be a non-negative integer');
    }

    const scope = await this.trialBalance.resolveStatementScope({
      from: query.from,
      to: query.to,
      currency: query.currency,
    });

    const account = await this.prisma.accountingAccount.findUnique({
      where: { accountStableId },
      select: {
        accountStableId: true,
        name: true,
        accountClass: true,
        type: true,
        currency: true,
        isActive: true,
      },
    });
    if (!account) {
      throw new NotFoundException('Accounting account not found');
    }
    if (account.currency !== scope.currency) {
      throw new BadRequestException(
        `account currency ${account.currency} does not match report currency ${scope.currency}`,
      );
    }

    const entryWhere = this.buildEntryWhere(query.phase, scope);
    const where = {
      ...entryWhere,
      lines: {
        some: {
          account: { accountStableId },
        },
      },
    };

    const [total, rows] = await Promise.all([
      this.prisma.accountingJournalEntry.count({ where }),
      this.prisma.accountingJournalEntry.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { entryStableId: 'desc' }],
        skip: offset,
        take: limit,
        select: {
          entryStableId: true,
          kind: true,
          source: true,
          sourceFactType: true,
          sourceFactStableId: true,
          sourceFactVersion: true,
          storeStableId: true,
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
                  accountClass: true,
                  type: true,
                },
              },
              category: {
                select: {
                  categoryStableId: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const normalSide = accountingTrialBalanceNormalSide(account.accountClass);
    const entries = rows.map((row) =>
      this.toEntry(row, accountStableId, normalSide),
    );
    const pageSummary = entries.reduce(
      (acc, entry) => ({
        journalEntryCount: acc.journalEntryCount + 1,
        accountDebitCents: acc.accountDebitCents + entry.accountDebitCents,
        accountCreditCents: acc.accountCreditCents + entry.accountCreditCents,
        accountNormalMovementCents:
          acc.accountNormalMovementCents + entry.accountNormalMovementCents,
      }),
      {
        journalEntryCount: 0,
        accountDebitCents: 0,
        accountCreditCents: 0,
        accountNormalMovementCents: 0,
      },
    );

    return {
      version: 1,
      scope: 'WHOLE_LEDGER',
      phase: query.phase,
      currency: scope.currency,
      timezone: scope.timezone,
      accountingStartDate: scope.accountingStartDate,
      requestedFrom: scope.requestedFrom,
      requestedTo: scope.requestedTo,
      effectiveFrom: scope.effectiveFrom,
      effectiveTo: scope.effectiveTo,
      account: {
        accountStableId: account.accountStableId,
        accountName: account.name,
        accountClass: account.accountClass,
        accountType: account.type,
        currency: account.currency,
        isActive: account.isActive,
        normalSide,
      },
      pageSummary,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + entries.length < total,
      },
      entries,
    };
  }

  private buildEntryWhere(
    phase: AccountingStatementDrillThroughPhaseV1,
    scope: Awaited<
      ReturnType<AccountingTrialBalanceService['resolveStatementScope']>
    >,
  ) {
    const base = {
      deletedAt: null,
      currency: scope.currency,
      occurredAt: {
        gte: scope.accountingStartAt,
        lt: scope.toExclusive,
      },
    };

    if (phase === 'CLOSING') return base;
    if (phase === 'OPENING') {
      return {
        ...base,
        OR: [
          { kind: AccountingJournalEntryKind.OPENING_BALANCE },
          { occurredAt: { lt: scope.fromInclusive } },
        ],
      };
    }
    return {
      ...base,
      kind: { not: AccountingJournalEntryKind.OPENING_BALANCE },
      occurredAt: {
        gte: scope.fromInclusive,
        lt: scope.toExclusive,
      },
    };
  }

  private toEntry(
    row: {
      entryStableId: string;
      kind: AccountingJournalEntryKind;
      source: AccountingStatementJournalEntryV1['source'];
      sourceFactType: string | null;
      sourceFactStableId: string | null;
      sourceFactVersion: number | null;
      storeStableId: string | null;
      occurredAt: Date;
      currency: string;
      memo: string | null;
      lines: Array<{
        lineNo: number;
        debitCents: number;
        creditCents: number;
        memo: string | null;
        account: {
          accountStableId: string;
          name: string;
          accountClass: AccountingStatementJournalEntryV1['lines'][number]['accountClass'];
          type: AccountingStatementJournalEntryV1['lines'][number]['accountType'];
        };
        category: {
          categoryStableId: string;
          name: string;
          type: AccountingStatementJournalEntryV1['lines'][number]['categoryType'];
        } | null;
      }>;
    },
    accountStableId: string,
    normalSide: 'DEBIT' | 'CREDIT',
  ): AccountingStatementJournalEntryV1 {
    const highlighted = row.lines.filter(
      (line) => line.account.accountStableId === accountStableId,
    );
    const accountDebitCents = highlighted.reduce(
      (sum, line) => sum + line.debitCents,
      0,
    );
    const accountCreditCents = highlighted.reduce(
      (sum, line) => sum + line.creditCents,
      0,
    );
    const debitMinusCredit = accountDebitCents - accountCreditCents;

    return {
      entryStableId: row.entryStableId,
      kind: row.kind,
      source: row.source,
      sourceFactType: row.sourceFactType,
      sourceFactStableId: row.sourceFactStableId,
      sourceFactVersion: row.sourceFactVersion,
      storeStableId: row.storeStableId,
      occurredAt: row.occurredAt.toISOString(),
      currency: row.currency,
      memo: row.memo,
      accountDebitCents,
      accountCreditCents,
      accountNormalMovementCents:
        normalSide === 'DEBIT' ? debitMinusCredit : -debitMinusCredit,
      entryDebitCents: row.lines.reduce(
        (sum, line) => sum + line.debitCents,
        0,
      ),
      entryCreditCents: row.lines.reduce(
        (sum, line) => sum + line.creditCents,
        0,
      ),
      highlightedLineNos: highlighted.map((line) => line.lineNo),
      lines: row.lines.map((line) => ({
        lineNo: line.lineNo,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
        accountStableId: line.account.accountStableId,
        accountName: line.account.name,
        accountClass: line.account.accountClass,
        accountType: line.account.type,
        categoryStableId: line.category?.categoryStableId ?? null,
        categoryName: line.category?.name ?? null,
        categoryType: line.category?.type ?? null,
      })),
    };
  }

  private resolveLimit(raw?: number): number {
    const limit = raw ?? DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${MAX_LIMIT}`,
      );
    }
    return limit;
  }
}
