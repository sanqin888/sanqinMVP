import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingPeriodService } from './accounting-period.service';
import {
  ORDER_REPORTING_FACTS_READER,
  type OrderReportingFactsReaderPort,
} from '../orders/public-api';

type AuditLogFilters = {
  entityType?: string;
  entityId?: string;
  operatorActorRef?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class AccountingService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    @Inject(ORDER_REPORTING_FACTS_READER)
    private readonly orderReportingFacts: OrderReportingFactsReaderPort,
  ) {}

  private parseDate(
    raw: string | undefined,
    endOfDay = false,
  ): Date | undefined {
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    if (raw.length <= 10) {
      if (endOfDay) date.setHours(23, 59, 59, 999);
      else date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  private buildAuditWhere(
    filters: AuditLogFilters,
  ): Prisma.AccountingAuditLogWhereInput {
    const fromDate = this.parseDate(filters.from);
    const toDate = this.parseDate(filters.to, true);
    return {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.operatorActorRef
        ? { operatorActorRef: filters.operatorActorRef }
        : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };
  }

  async dimensionSlice(query: { from?: string; to?: string }) {
    const timezone = await this.period.getBusinessTimezone();
    const parseStoreBoundary = (
      raw: string | undefined,
      boundary: 'start' | 'end',
    ): Date | undefined => {
      if (!raw) return undefined;
      const parsed = DateTime.fromISO(raw, { zone: timezone });
      if (!parsed.isValid) {
        throw new BadRequestException(`Invalid date: ${raw}`);
      }
      const bounded =
        boundary === 'start' ? parsed.startOf('day') : parsed.endOf('day');
      return bounded.toUTC().toJSDate();
    };

    const fromDate = await this.period.clampAccountingFromDate(
      parseStoreBoundary(query.from, 'start'),
    );
    const toDate = parseStoreBoundary(query.to, 'end');
    const dimensions =
      await this.orderReportingFacts.readPaidTotalDimensionsForRange(
        fromDate,
        toDate,
      );
    return {
      from: query.from ?? null,
      to: query.to ?? null,
      ...dimensions,
    };
  }

  async listAuditLogs(filters: AuditLogFilters) {
    return this.prisma.accountingAuditLog.findMany({
      where: this.buildAuditWhere(filters),
      select: {
        action: true,
        entityType: true,
        entityId: true,
        beforeJson: true,
        afterJson: true,
        operatorActorRef: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
