import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import {
  AccountingJournalEntryKind,
  AccountingTxType,
} from './accounting-contracts';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';

type AccountingDbClient = AccountingDb | Prisma.TransactionClient;

@Injectable()
export class AccountingPeriodService {
  private static readonly DEFAULT_BUSINESS_TIMEZONE = 'America/Toronto';

  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
  ) {}

  async getBusinessTimezone(): Promise<string> {
    const { timezone } =
      await this.brandStoreConfigReader.getConfiguredStoreSnapshot();
    return timezone.trim() || AccountingPeriodService.DEFAULT_BUSINESS_TIMEZONE;
  }

  private async readAccountingStartDate(
    db: AccountingDbClient,
  ): Promise<string | null> {
    const config = await db.accountingAutomationConfig.findUnique({
      where: { id: 1 },
      select: { accountingStartDate: true },
    });
    return config?.accountingStartDate?.toISOString().slice(0, 10) ?? null;
  }

  async getAccountingStartDate(): Promise<string | null> {
    return this.readAccountingStartDate(this.prisma);
  }

  private async getAccountingStartAt(
    db: AccountingDbClient = this.prisma,
  ): Promise<Date | undefined> {
    const startDate = await this.readAccountingStartDate(db);
    if (!startDate) return undefined;
    const timezone = await this.getBusinessTimezone();
    const localStart = DateTime.fromISO(startDate, { zone: timezone }).startOf(
      'day',
    );
    if (!localStart.isValid) {
      throw new BadRequestException(
        `Invalid accounting start date/timezone: ${startDate} / ${timezone}`,
      );
    }
    return localStart.toUTC().toJSDate();
  }

  async requireCanonicalFinancialPostingStartAt(): Promise<Date> {
    const startAt = await this.getAccountingStartAt();
    if (!startAt) {
      throw new ConflictException(
        'accountingStartDate must be configured before canonical financial posting',
      );
    }
    return startAt;
  }

  async assertOnOrAfterAccountingStartDate(
    occurredAt: Date,
    db: AccountingDbClient = this.prisma,
  ): Promise<void> {
    const startAt = await this.getAccountingStartAt(db);
    if (startAt && occurredAt < startAt) {
      throw new BadRequestException(
        `occurredAt is before accounting start date ${startAt.toISOString().slice(0, 10)}`,
      );
    }
  }

  async clampAccountingFromDate(requested?: Date): Promise<Date | undefined> {
    const startAt = await this.getAccountingStartAt();
    if (!startAt) return requested;
    if (!requested || requested < startAt) return startAt;
    return requested;
  }

  toPeriodKey(date: Date, timezone: string): string {
    const zoned = DateTime.fromJSDate(date, { zone: timezone });
    if (!zoned.isValid) {
      throw new BadRequestException(
        `Invalid occurredAt for timezone ${timezone}`,
      );
    }
    const year = zoned.year;
    const month = `${zoned.month}`.padStart(2, '0');
    return `${year}-${month}`;
  }

  private monthBounds(periodKey: string, timezone: string) {
    const parsed = /^(\d{4})-(\d{2})$/.exec(periodKey);
    if (!parsed) {
      throw new BadRequestException('periodKey must use YYYY-MM format');
    }
    const year = Number(parsed[1]);
    const month = Number(parsed[2]);
    const start = DateTime.fromObject(
      { year, month, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      { zone: timezone },
    );
    if (!start.isValid) {
      throw new BadRequestException(`Invalid periodKey: ${periodKey}`);
    }

    const end = start.endOf('month');
    return {
      startAt: start.toUTC().toJSDate(),
      endAt: end.toUTC().toJSDate(),
    };
  }

  private yearBounds(periodKey: string, timezone: string) {
    if (!/^\d{4}$/.test(periodKey)) {
      throw new BadRequestException('periodKey must use YYYY format');
    }
    const year = Number(periodKey);
    const start = DateTime.fromObject(
      { year, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      { zone: timezone },
    );
    if (!start.isValid) {
      throw new BadRequestException(`Invalid periodKey: ${periodKey}`);
    }
    return {
      startAt: start.toUTC().toJSDate(),
      endAt: start.endOf('year').toUTC().toJSDate(),
    };
  }

  async assertEditableForPeriod(
    occurredAt: Date,
    type: AccountingTxType,
    db: AccountingDbClient = this.prisma,
    timezone?: string,
  ): Promise<void> {
    const businessTimezone = timezone ?? (await this.getBusinessTimezone());
    const zoned = DateTime.fromJSDate(occurredAt, { zone: businessTimezone });
    if (!zoned.isValid) {
      throw new BadRequestException('Invalid accounting occurredAt');
    }
    const yearKey = `${zoned.year}`;
    const yearLocked = await db.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: {
          periodType: 'YEAR',
          periodKey: yearKey,
        },
      },
      select: { id: true },
    });
    if (yearLocked) {
      throw new ForbiddenException(
        `财年 ${yearKey} 已硬锁账，不允许修改历史分录。`,
      );
    }

    const periodKey = this.toPeriodKey(occurredAt, businessTimezone);
    const monthClosed = await db.accountingPeriodClose.findUnique({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey,
        },
      },
      select: { id: true },
    });

    if (!monthClosed) return;
    if (type !== AccountingTxType.ADJUSTMENT) {
      throw new ForbiddenException(
        `期间 ${periodKey} 已月结；可先重新打开月份，或使用 ADJUSTMENT 调整。`,
      );
    }
  }

  async assertJournalEditableForPeriod(
    occurredAt: Date,
    kind: AccountingJournalEntryKind,
    db: AccountingDbClient = this.prisma,
    timezone?: string,
  ): Promise<void> {
    return this.assertEditableForPeriod(
      occurredAt,
      kind === AccountingJournalEntryKind.ADJUSTMENT
        ? AccountingTxType.ADJUSTMENT
        : AccountingTxType.EXPENSE,
      db,
      timezone,
    );
  }

  async closeMonth(periodKey: string, operatorUserStableId: string) {
    const timezone = await this.getBusinessTimezone();
    const { startAt, endAt } = this.monthBounds(periodKey, timezone);
    const yearKey = periodKey.slice(0, 4);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const accountingStartDate = await this.readAccountingStartDate(tx);
      if (accountingStartDate && periodKey < accountingStartDate.slice(0, 7)) {
        throw new BadRequestException(
          `period ${periodKey} is before accounting start date ${accountingStartDate}`,
        );
      }

      const yearLocked = await tx.accountingPeriodClose.findUnique({
        where: {
          periodType_periodKey: { periodType: 'YEAR', periodKey: yearKey },
        },
        select: { id: true },
      });
      if (yearLocked) {
        throw new ConflictException(`财年 ${yearKey} 已硬锁账`);
      }

      const close = await tx.accountingPeriodClose.upsert({
        where: {
          periodType_periodKey: {
            periodType: 'MONTH',
            periodKey,
          },
        },
        create: {
          periodType: 'MONTH',
          periodKey,
          startAt,
          endAt,
          closedByUserStableId: operatorUserStableId,
        },
        update: {
          startAt,
          endAt,
          closedByUserStableId: operatorUserStableId,
          closedAt: new Date(),
        },
        select: {
          periodType: true,
          periodKey: true,
          startAt: true,
          endAt: true,
          closedByUserStableId: true,
          closedAt: true,
        },
      });

      await writeAccountingAuditLog(tx, {
        action: 'PERIOD_CLOSE',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: periodKey,
        operatorActorRef: operatorUserStableId,
        afterJson: close as unknown as Prisma.InputJsonValue,
      });

      return close;
    });
  }

  async reopenMonth(periodKey: string, operatorUserStableId: string) {
    const timezone = await this.getBusinessTimezone();
    this.monthBounds(periodKey, timezone);
    const yearKey = periodKey.slice(0, 4);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const yearLocked = await tx.accountingPeriodClose.findUnique({
        where: {
          periodType_periodKey: { periodType: 'YEAR', periodKey: yearKey },
        },
        select: { id: true },
      });
      if (yearLocked) {
        throw new ForbiddenException(
          `财年 ${yearKey} 已硬锁账，月份不能重新打开`,
        );
      }
      const existing = await tx.accountingPeriodClose.findUnique({
        where: {
          periodType_periodKey: { periodType: 'MONTH', periodKey },
        },
        select: {
          periodType: true,
          periodKey: true,
          startAt: true,
          endAt: true,
          closedByUserStableId: true,
          closedAt: true,
        },
      });
      if (!existing) return { reopened: false, periodKey };

      await tx.accountingPeriodClose.delete({
        where: {
          periodType_periodKey: { periodType: 'MONTH', periodKey },
        },
      });
      await writeAccountingAuditLog(tx, {
        action: 'PERIOD_REOPEN',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: periodKey,
        operatorActorRef: operatorUserStableId,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
      });
      return { reopened: true, periodKey };
    });
  }

  async closeYear(periodKey: string, operatorUserStableId: string) {
    const timezone = await this.getBusinessTimezone();
    const { startAt, endAt } = this.yearBounds(periodKey, timezone);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const accountingStartDate = await this.readAccountingStartDate(tx);
      const accountingStartYear = accountingStartDate?.slice(0, 4) ?? null;
      if (accountingStartYear && periodKey < accountingStartYear) {
        throw new BadRequestException(
          `fiscal year ${periodKey} is before accounting start date ${accountingStartDate}`,
        );
      }
      const firstRequiredMonth =
        accountingStartDate && periodKey === accountingStartYear
          ? Number(accountingStartDate.slice(5, 7))
          : 1;
      const requiredMonths = Array.from(
        { length: 13 - firstRequiredMonth },
        (_, index) =>
          `${periodKey}-${String(firstRequiredMonth + index).padStart(2, '0')}`,
      );
      const monthRows = await tx.accountingPeriodClose.findMany({
        where: { periodType: 'MONTH', periodKey: { in: requiredMonths } },
        select: { periodKey: true },
      });
      const closedMonths = new Set(monthRows.map((row) => row.periodKey));
      const missingMonths = requiredMonths.filter(
        (month) => !closedMonths.has(month),
      );
      if (missingMonths.length) {
        throw new ConflictException(
          `年度硬锁前必须完成财务起始日期后的应结月份；未月结：${missingMonths.join(', ')}`,
        );
      }

      const close = await tx.accountingPeriodClose.upsert({
        where: {
          periodType_periodKey: { periodType: 'YEAR', periodKey },
        },
        create: {
          periodType: 'YEAR',
          periodKey,
          startAt,
          endAt,
          closedByUserStableId: operatorUserStableId,
        },
        update: {
          startAt,
          endAt,
          closedByUserStableId: operatorUserStableId,
          closedAt: new Date(),
        },
        select: {
          periodType: true,
          periodKey: true,
          startAt: true,
          endAt: true,
          closedByUserStableId: true,
          closedAt: true,
        },
      });
      await writeAccountingAuditLog(tx, {
        action: 'YEAR_LOCK',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: periodKey,
        operatorActorRef: operatorUserStableId,
        afterJson: close as unknown as Prisma.InputJsonValue,
      });
      return close;
    });
  }

  async listPeriodCloseStatus(periodKeys?: string[]) {
    return this.prisma.accountingPeriodClose.findMany({
      where: {
        periodType: 'MONTH',
        ...(periodKeys?.length ? { periodKey: { in: periodKeys } } : {}),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserStableId: true,
        closedAt: true,
      },
      orderBy: { periodKey: 'asc' },
    });
  }

  async listYearCloseStatus(years?: string[]) {
    return this.prisma.accountingPeriodClose.findMany({
      where: {
        periodType: 'YEAR',
        ...(years?.length ? { periodKey: { in: years } } : {}),
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserStableId: true,
        closedAt: true,
      },
      orderBy: { periodKey: 'asc' },
    });
  }
}
