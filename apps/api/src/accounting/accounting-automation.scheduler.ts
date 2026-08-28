import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingGmailIngestService } from './accounting-gmail-ingest.service';
import {
  UBER_EATS_REPORTING,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';

type AutomationSettings = {
  timezone: string;
  runHour: number;
  runMinute: number;
  gmailEnabled: boolean;
  uberReportsEnabled: boolean;
};

@Injectable()
export class AccountingAutomationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccountingAutomationScheduler.name);
  private timeout?: NodeJS.Timeout;
  private running?: Promise<unknown>;

  constructor(
    private readonly gmail: AccountingGmailIngestService,
    private readonly prisma: PrismaService,
    @Inject(UBER_EATS_REPORTING)
    private readonly uberReporting: UberEatsReportingPort,
  ) {}

  async onModuleInit() {
    await this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timeout) clearTimeout(this.timeout);
  }

  async getSettings(): Promise<
    AutomationSettings & { nextRunAt: string | null }
  > {
    const settings = await this.loadSettings();
    return {
      ...settings,
      nextRunAt: this.nextRun(settings)?.toISO() ?? null,
    };
  }

  async updateSettings(input: Partial<AutomationSettings>) {
    const current = await this.loadSettings();
    const timezone = input.timezone?.trim() || current.timezone;
    const zoneCheck = DateTime.now().setZone(timezone);
    if (!zoneCheck.isValid) {
      throw new BadRequestException('invalid accounting automation timezone');
    }
    const runHour = input.runHour ?? current.runHour;
    const runMinute = input.runMinute ?? current.runMinute;
    if (!Number.isInteger(runHour) || runHour < 0 || runHour > 23) {
      throw new BadRequestException(
        'runHour must be an integer between 0 and 23',
      );
    }
    if (!Number.isInteger(runMinute) || runMinute < 0 || runMinute > 59) {
      throw new BadRequestException(
        'runMinute must be an integer between 0 and 59',
      );
    }

    await this.prisma.accountingAutomationConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        timezone,
        runHour,
        runMinute,
        gmailEnabled: input.gmailEnabled ?? current.gmailEnabled,
        uberReportsEnabled:
          input.uberReportsEnabled ?? current.uberReportsEnabled,
      },
      update: {
        timezone,
        runHour,
        runMinute,
        ...(input.gmailEnabled !== undefined
          ? { gmailEnabled: input.gmailEnabled }
          : {}),
        ...(input.uberReportsEnabled !== undefined
          ? { uberReportsEnabled: input.uberReportsEnabled }
          : {}),
      },
    });
    await this.scheduleNextRun();
    return this.getSettings();
  }

  async runNow() {
    if (this.running) return this.running;
    const settings = await this.loadSettings();
    this.running = this.runDailyJobs(settings).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async loadSettings(): Promise<AutomationSettings> {
    const row = await this.prisma.accountingAutomationConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        timezone: 'America/Toronto',
        runHour: 2,
        runMinute: 15,
        gmailEnabled: true,
        uberReportsEnabled: true,
      },
      update: {},
      select: {
        timezone: true,
        runHour: true,
        runMinute: true,
        gmailEnabled: true,
        uberReportsEnabled: true,
      },
    });
    return row;
  }

  private nextRun(settings: AutomationSettings) {
    const now = DateTime.now().setZone(settings.timezone);
    if (!now.isValid) return null;
    let next = now.set({
      hour: settings.runHour,
      minute: settings.runMinute,
      second: 0,
      millisecond: 0,
    });
    if (next <= now) next = next.plus({ days: 1 });
    return next;
  }

  private async scheduleNextRun() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    const settings = await this.loadSettings();
    const next = this.nextRun(settings);
    if (!next) {
      this.logger.error(
        'Accounting automation schedule has an invalid timezone',
      );
      return;
    }
    const delay = Math.max(next.toMillis() - DateTime.now().toMillis(), 1_000);
    this.timeout = setTimeout(() => {
      void this.runNow()
        .catch((error) => {
          this.logger.error(
            'Accounting daily automation failed',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          void this.scheduleNextRun();
        });
    }, delay);
    this.logger.log(
      `Next accounting automation run scheduled for ${next.toISO() ?? 'unknown'}`,
    );
  }

  private async runDailyJobs(settings: AutomationSettings) {
    const gmail = settings.gmailEnabled
      ? await this.gmail.ingestBillsMailbox()
      : {
          configured: true,
          disabled: true,
          scannedMessages: 0,
          importedDocuments: 0,
          duplicateDocuments: 0,
          failedDocuments: 0,
        };
    const uber = settings.uberReportsEnabled
      ? await this.requestUberReports(settings.timezone)
      : [];
    this.logger.log(
      `Accounting automation completed: gmailImported=${gmail.importedDocuments} gmailDuplicates=${gmail.duplicateDocuments} uberRequested=${uber.length}`,
    );
    return { gmail, uber };
  }

  private async requestUberReports(timezone: string) {
    const scopes = new Set(
      (process.env.UBER_EATS_APP_SCOPES ?? '')
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!scopes.has('eats.report')) return [];

    const stores = await this.prisma.uberStoreMapping.findMany({
      where: { isProvisioned: true },
      select: { uberStoreId: true },
      orderBy: { uberStoreId: 'asc' },
    });
    const storeUuids = stores.map((store) => store.uberStoreId);
    if (!storeUuids.length) return [];

    const today = DateTime.now().setZone(timezone).startOf('day');
    const startDate = today.minus({ days: 4 }).toISODate();
    const endDate = today.minus({ days: 1 }).toISODate();
    if (!startDate || !endDate) return [];

    return this.uberReporting.requestFinancialReports({
      storeUuids,
      startDate,
      endDate,
      reportTypes: [
        'PAYMENT_DETAILS_REPORT',
        'FINANCE_SUMMARY_REPORT',
        'ORDERS_AND_ITEMS_REPORT',
      ],
    });
  }
}
