import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AccountingFinancialProvider,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
  type AccountingJournalSource as AccountingJournalSourceValue,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS,
  providerForPendingAccountStableId,
} from './accounting-provider-accounts';
import {
  projectProviderPendingReconciliation,
  type ProviderPendingCoverageEvidenceV1,
  type ProviderPendingReconciliationLineV1,
} from './accounting-provider-pending-reconciliation.policy';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import { AccountingPeriodService } from './accounting-period.service';

type ReconciliationRange = {
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  accountingStartAt: Date;
  fromInclusive: Date;
  toExclusive: Date;
};

const ALL_PROVIDERS: AccountingFinancialProviderValue[] = [
  AccountingFinancialProvider.CLOVER,
  AccountingFinancialProvider.UBER_EATS,
  AccountingFinancialProvider.FANTUAN,
];

const isoDate = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

@Injectable()
export class AccountingProviderPendingReconciliationService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
  ) {}

  async reconcile(input: {
    storeStableId: string;
    from?: string;
    to?: string;
    provider?: AccountingFinancialProviderValue;
  }) {
    const storeStableId = input.storeStableId.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const timezone = await this.period.getBusinessTimezone();
    const accountingStartDate = await this.period.getAccountingStartDate();
    if (!accountingStartDate) {
      throw new ConflictException(
        'accountingStartDate must be configured before Provider Pending reconciliation',
      );
    }
    const range = this.resolveRange({
      from: input.from,
      to: input.to,
      timezone,
      accountingStartDate,
    });
    const providers = input.provider ? [input.provider] : ALL_PROVIDERS;
    const pendingAccountStableIds = providers.map(
      (provider) => ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[provider],
    );

    const [journalRows, coverageRows] = await Promise.all([
      this.prisma.accountingJournalLine.findMany({
        where: {
          account: {
            accountStableId: { in: pendingAccountStableIds },
          },
          entry: {
            deletedAt: null,
            OR: [{ storeStableId }, { storeStableId: null }],
            currency: 'CAD',
            occurredAt: {
              gte: range.accountingStartAt,
              lt: range.toExclusive,
            },
          },
        },
        select: {
          debitCents: true,
          creditCents: true,
          account: {
            select: {
              accountStableId: true,
            },
          },
          entry: {
            select: {
              entryStableId: true,
              storeStableId: true,
              occurredAt: true,
              source: true,
              sourceFactType: true,
            },
          },
        },
        orderBy: { lineNo: 'asc' },
      }),
      this.settlementQuery.readProviderFinancialCoverage({
        storeStableId,
        providers,
      }),
    ]);

    const unscopedRow = journalRows.find(
      (row) => row.entry.storeStableId === null,
    );
    if (unscopedRow) {
      throw new ConflictException(
        `Unscoped Provider Pending Journal movement prevents store reconciliation: ${unscopedRow.entry.entryStableId}`,
      );
    }

    const lines: ProviderPendingReconciliationLineV1[] = journalRows.map(
      (row) => {
        const provider = providerForPendingAccountStableId(
          row.account.accountStableId,
        );
        if (!provider || !providers.includes(provider)) {
          throw new ConflictException(
            `Unexpected Provider Pending account in reconciliation: ${row.account.accountStableId}`,
          );
        }
        return {
          provider,
          occurredAt: row.entry.occurredAt,
          debitCents: row.debitCents,
          creditCents: row.creditCents,
          source: row.entry.source as AccountingJournalSourceValue,
          sourceFactType: row.entry.sourceFactType,
          entryStableId: row.entry.entryStableId,
        };
      },
    );
    const coverage: ProviderPendingCoverageEvidenceV1[] = coverageRows.map(
      (row) => ({
        provider: row.provider,
        financialHistoryRequiredFrom: isoDate(row.financialHistoryRequiredFrom),
        financialCompleteThrough: isoDate(row.financialCompleteThrough),
      }),
    );

    try {
      return projectProviderPendingReconciliation({
        timezone,
        accountingStartDate,
        storeStableId,
        requestedFrom: range.requestedFrom,
        requestedTo: range.requestedTo,
        effectiveFrom: range.effectiveFrom,
        effectiveTo: range.effectiveTo,
        fromInclusive: range.fromInclusive,
        toExclusive: range.toExclusive,
        lines,
        coverage,
        ...(input.provider ? { provider: input.provider } : {}),
      });
    } catch (cause) {
      throw new ConflictException(
        cause instanceof Error
          ? cause.message
          : 'Provider Pending reconciliation invariant failed',
      );
    }
  }

  private resolveRange(params: {
    from?: string;
    to?: string;
    timezone: string;
    accountingStartDate: string;
  }): ReconciliationRange {
    const accountingStart = this.parseDateOnly(
      params.accountingStartDate,
      params.timezone,
      'accountingStartDate',
    );
    const today = DateTime.now().setZone(params.timezone).toISODate();
    if (!today) {
      throw new ConflictException(
        'Unable to resolve Provider Pending reconciliation date',
      );
    }

    const requestedFrom = params.from?.trim() || params.accountingStartDate;
    const requestedTo = params.to?.trim() || today;
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
      throw new BadRequestException(
        'Provider Pending reconciliation range is invalid',
      );
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
}
