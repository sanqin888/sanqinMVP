import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingPeriodService } from './accounting-period.service';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';
import {
  projectAccountingTrialBalance,
  type AccountingTrialBalanceJournalLineV1,
  type AccountingTrialBalanceProjectionV1,
} from './accounting-trial-balance.policy';

type ResolvedTrialBalanceRange = {
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  accountingStartAt: Date;
  fromInclusive: Date;
  toExclusive: Date;
};

@Injectable()
export class AccountingTrialBalanceService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async project(query: {
    from?: string;
    to?: string;
    currency?: string;
  }): Promise<AccountingTrialBalanceReportV1> {
    const timezone = await this.period.getBusinessTimezone();
    const accountingStartDate = await this.period.getAccountingStartDate();
    if (!accountingStartDate) {
      throw new ConflictException(
        'accountingStartDate must be configured before Trial Balance reporting',
      );
    }

    const currency = this.resolveCurrency(query.currency);
    const range = this.resolveRange({
      from: query.from,
      to: query.to,
      timezone,
      accountingStartDate,
    });

    const rows = await this.prisma.accountingJournalLine.findMany({
      where: {
        entry: {
          deletedAt: null,
          currency,
          occurredAt: {
            gte: range.accountingStartAt,
            lt: range.toExclusive,
          },
        },
      },
      select: {
        debitCents: true,
        creditCents: true,
        entry: {
          select: {
            entryStableId: true,
            kind: true,
            occurredAt: true,
          },
        },
        account: {
          select: {
            accountStableId: true,
            name: true,
            accountClass: true,
            type: true,
            currency: true,
            isActive: true,
          },
        },
      },
    });

    const lines: AccountingTrialBalanceJournalLineV1[] = rows.map((row) => ({
      entryStableId: row.entry.entryStableId,
      kind: row.entry.kind,
      occurredAt: row.entry.occurredAt,
      debitCents: row.debitCents,
      creditCents: row.creditCents,
      account: {
        accountStableId: row.account.accountStableId,
        accountName: row.account.name,
        accountClass: row.account.accountClass,
        accountType: row.account.type,
        currency: row.account.currency,
        isActive: row.account.isActive,
      },
    }));

    let projection: AccountingTrialBalanceProjectionV1;
    try {
      projection = projectAccountingTrialBalance({
        currency,
        fromInclusive: range.fromInclusive,
        toExclusive: range.toExclusive,
        lines,
      });
    } catch (cause) {
      throw new ConflictException(
        cause instanceof Error
          ? cause.message
          : 'Trial Balance projection invariant failed',
      );
    }

    const closeStatus = await this.readCloseStatus(
      range.effectiveFrom,
      range.effectiveTo,
      timezone,
    );

    return {
      version: 1,
      scope: 'WHOLE_LEDGER',
      currency,
      timezone,
      accountingStartDate,
      requestedFrom: range.requestedFrom,
      requestedTo: range.requestedTo,
      effectiveFrom: range.effectiveFrom,
      effectiveTo: range.effectiveTo,
      openingBalanceJournal: projection.openingBalanceJournal,
      totals: projection.totals,
      accounts: projection.accounts,
      closeStatus,
    };
  }

  private resolveCurrency(raw?: string): string {
    const currency = raw?.trim().toUpperCase() || 'CAD';
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be a 3-letter code');
    }
    return currency;
  }

  private resolveRange(params: {
    from?: string;
    to?: string;
    timezone: string;
    accountingStartDate: string;
  }): ResolvedTrialBalanceRange {
    const accountingStart = this.parseDateOnly(
      params.accountingStartDate,
      params.timezone,
      'accountingStartDate',
    );
    const now = DateTime.now().setZone(params.timezone);
    if (!now.isValid) {
      throw new ConflictException(
        `Invalid business timezone: ${params.timezone}`,
      );
    }
    const requestedFrom = params.from?.trim() || params.accountingStartDate;
    const requestedTo = params.to?.trim() || now.toISODate();
    if (!requestedTo) {
      throw new ConflictException('Unable to resolve Trial Balance end date');
    }
    const from = this.parseDateOnly(requestedFrom, params.timezone, 'from');
    const to = this.parseDateOnly(requestedTo, params.timezone, 'to');

    if (from.toMillis() > to.toMillis()) {
      throw new BadRequestException('from must be on or before to');
    }
    if (to.toMillis() < accountingStart.toMillis()) {
      throw new BadRequestException(
        `to is before accounting start date ${params.accountingStartDate}`,
      );
    }

    const effectiveFromDateTime =
      from.toMillis() < accountingStart.toMillis() ? accountingStart : from;
    const effectiveFrom = effectiveFromDateTime.toISODate();
    const effectiveTo = to.toISODate();
    if (!effectiveFrom || !effectiveTo) {
      throw new BadRequestException('Trial Balance range is invalid');
    }

    return {
      requestedFrom,
      requestedTo,
      effectiveFrom,
      effectiveTo,
      accountingStartAt: accountingStart.toUTC().toJSDate(),
      fromInclusive: effectiveFromDateTime.toUTC().toJSDate(),
      toExclusive: to.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
    };
  }

  private parseDateOnly(
    value: string,
    timezone: string,
    field: string,
  ): DateTime {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }
    const parsed = DateTime.fromISO(value, { zone: timezone }).startOf('day');
    if (!parsed.isValid || parsed.toISODate() !== value) {
      throw new BadRequestException(`Invalid ${field}: ${value}`);
    }
    return parsed;
  }

  private async readCloseStatus(
    effectiveFrom: string,
    effectiveTo: string,
    timezone: string,
  ) {
    const monthKeys = this.monthKeysBetween(
      effectiveFrom,
      effectiveTo,
      timezone,
    );
    const yearKeys = Array.from(
      new Set(monthKeys.map((periodKey) => periodKey.slice(0, 4))),
    );
    const [closedMonths, closedYears] = await Promise.all([
      this.period.listPeriodCloseStatus(monthKeys),
      this.period.listYearCloseStatus(yearKeys),
    ]);
    const closedMonthKeys = new Set(closedMonths.map((row) => row.periodKey));
    const closedYearKeys = new Set(closedYears.map((row) => row.periodKey));

    return {
      months: monthKeys.map((periodKey) => ({
        periodKey,
        isClosed: closedMonthKeys.has(periodKey),
      })),
      years: yearKeys.map((periodKey) => ({
        periodKey,
        isClosed: closedYearKeys.has(periodKey),
      })),
      allMonthsClosed:
        monthKeys.length > 0 &&
        monthKeys.every((periodKey) => closedMonthKeys.has(periodKey)),
    };
  }

  private monthKeysBetween(
    from: string,
    to: string,
    timezone: string,
  ): string[] {
    const end = this.parseDateOnly(to, timezone, 'to').startOf('month');
    let cursor = this.parseDateOnly(from, timezone, 'from').startOf('month');
    const keys: string[] = [];

    while (cursor.toMillis() <= end.toMillis()) {
      keys.push(cursor.toFormat('yyyy-MM'));
      cursor = cursor.plus({ months: 1 });
      if (keys.length > 1200) {
        throw new BadRequestException('Trial Balance range is too large');
      }
    }

    return keys;
  }
}
