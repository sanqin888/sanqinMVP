import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { PrismaService } from '../prisma/prisma.service';

const BANK_OF_CANADA_SERIES = 'FXCNYCAD';
const BANK_OF_CANADA_LATEST_URL =
  'https://www.bankofcanada.ca/valet/observations/FXCNYCAD/json?recent=10';
const BANK_OF_CANADA_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEZONE = 'America/Toronto';
const DAILY_REFRESH_HOUR = 17;

type ExchangeRateSource = 'BANK_OF_CANADA' | 'BUSINESS_CONFIG_FALLBACK';

type CachedCadCnyRate = {
  rateHundredths: number;
  rawSourceRate: number | null;
  sourceDate: string | null;
  source: ExchangeRateSource;
  fetchedAt: Date;
};

type RuntimeConfig = {
  timezone: string;
  fallbackRateHundredths: number | null;
};

type StoreClock = {
  date: string;
  hour: number;
};

type BankOfCanadaObservation = {
  date: string;
  cnyToCadRate: number;
};

export type PosExchangeRateQuote = {
  cadAmountCents: number;
  cnyAmountFen: number;
  cadToCnyRate: number;
  rateDate: string | null;
  source: ExchangeRateSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

@Injectable()
export class PosExchangeRateService {
  private readonly logger = new AppLogger(PosExchangeRateService.name);
  private cache: CachedCadCnyRate | null = null;
  private runtimeConfig: RuntimeConfig | null = null;
  private refreshPromise: Promise<void> | null = null;
  private lastDailyInitialAttemptDate: string | null = null;
  private lastPostCutoffAttemptDate: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async quoteCadToCny(cadAmountCents: number): Promise<PosExchangeRateQuote> {
    if (!Number.isSafeInteger(cadAmountCents) || cadAmountCents < 0) {
      throw new BadRequestException(
        'cadAmountCents must be a non-negative safe integer',
      );
    }

    await this.ensureDailyRate(new Date());

    const rate = this.cache;
    if (!rate) {
      throw new ServiceUnavailableException(
        'CAD/CNY exchange rate unavailable',
      );
    }

    // CAD cents × (CNY/CAD hundredths) / 100 = CNY fen.
    // The business conversion therefore uses exactly the same two-decimal
    // exchange rate that is returned to and displayed by the POS.
    const scaledFenHundredths = cadAmountCents * rate.rateHundredths;
    if (!Number.isSafeInteger(scaledFenHundredths)) {
      throw new BadRequestException(
        'CAD amount is too large to convert safely',
      );
    }
    const cnyAmountFen = Math.round(scaledFenHundredths / 100);

    return {
      cadAmountCents,
      cnyAmountFen,
      cadToCnyRate: rate.rateHundredths / 100,
      rateDate: rate.sourceDate,
      source: rate.source,
    };
  }

  private async ensureDailyRate(now: Date): Promise<void> {
    const config = await this.getRuntimeConfig();
    const clock = this.getStoreClock(now, config.timezone);
    const isPostCutoff = clock.hour >= DAILY_REFRESH_HOUR;

    if (this.refreshPromise) {
      await this.refreshPromise;
    }

    if (this.lastDailyInitialAttemptDate !== clock.date) {
      this.lastDailyInitialAttemptDate = clock.date;
      if (isPostCutoff) {
        this.lastPostCutoffAttemptDate = clock.date;
      }
      await this.refreshLatestRate(clock.date, 'daily-first-use');
      return;
    }

    if (isPostCutoff && this.lastPostCutoffAttemptDate !== clock.date) {
      this.lastPostCutoffAttemptDate = clock.date;
      await this.refreshLatestRate(clock.date, '17:00-first-use');
    }
  }

  private async refreshLatestRate(
    storeDate: string,
    reason: 'daily-first-use' | '17:00-first-use',
  ): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.performRefresh(storeDate, reason).finally(() => {
      this.refreshPromise = null;
    });
    await this.refreshPromise;
  }

  private async performRefresh(
    storeDate: string,
    reason: 'daily-first-use' | '17:00-first-use',
  ): Promise<void> {
    const config = await this.getRuntimeConfig(true);

    try {
      const observation = await this.fetchLatestBankOfCanadaObservation();
      const rateHundredths = this.toCadCnyRateHundredths(
        observation.cnyToCadRate,
      );
      const current = this.cache;
      const shouldUpdate =
        !current ||
        current.source !== 'BANK_OF_CANADA' ||
        current.sourceDate === null ||
        observation.date > current.sourceDate ||
        (observation.date === current.sourceDate &&
          observation.cnyToCadRate !== current.rawSourceRate);

      if (shouldUpdate) {
        this.cache = {
          rateHundredths,
          rawSourceRate: observation.cnyToCadRate,
          sourceDate: observation.date,
          source: 'BANK_OF_CANADA',
          fetchedAt: new Date(),
        };
        this.logger.log(
          `[pos.fx] cache updated reason=${reason} storeDate=${storeDate} sourceDate=${observation.date} cadToCny=${this.formatRate(rateHundredths)} source=${BANK_OF_CANADA_SERIES}`,
        );
      } else {
        this.logger.log(
          `[pos.fx] no newer rate reason=${reason} storeDate=${storeDate} sourceDate=${observation.date} cachedSourceDate=${current.sourceDate ?? 'none'}`,
        );
      }
      return;
    } catch (error) {
      if (this.cache) {
        this.logger.warn(
          `[pos.fx] Bank of Canada lookup failed; keeping cached rate reason=${reason} storeDate=${storeDate} cachedSource=${this.cache.source} cachedSourceDate=${this.cache.sourceDate ?? 'none'} error=${this.describeError(error)}`,
        );
        return;
      }

      if (config.fallbackRateHundredths !== null) {
        this.cache = {
          rateHundredths: config.fallbackRateHundredths,
          rawSourceRate: null,
          sourceDate: null,
          source: 'BUSINESS_CONFIG_FALLBACK',
          fetchedAt: new Date(),
        };
        this.logger.warn(
          `[pos.fx] Bank of Canada lookup failed; using BusinessConfig fallback reason=${reason} storeDate=${storeDate} cadToCny=${this.formatRate(config.fallbackRateHundredths)} error=${this.describeError(error)}`,
        );
        return;
      }

      throw new ServiceUnavailableException(
        'CAD/CNY exchange rate unavailable',
      );
    }
  }

  private async getRuntimeConfig(force = false): Promise<RuntimeConfig> {
    if (!force && this.runtimeConfig) return this.runtimeConfig;

    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
      select: {
        timezone: true,
        wechatAlipayExchangeRate: true,
      },
    });

    const timezone = config?.timezone?.trim() || DEFAULT_TIMEZONE;
    const manualRate = config?.wechatAlipayExchangeRate;
    const fallbackRateHundredths =
      typeof manualRate === 'number' &&
      Number.isFinite(manualRate) &&
      manualRate > 0
        ? Math.round(manualRate * 100)
        : null;

    this.runtimeConfig = {
      timezone: this.isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE,
      fallbackRateHundredths:
        fallbackRateHundredths && fallbackRateHundredths > 0
          ? fallbackRateHundredths
          : null,
    };
    return this.runtimeConfig;
  }

  private async fetchLatestBankOfCanadaObservation(): Promise<BankOfCanadaObservation> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BANK_OF_CANADA_TIMEOUT_MS,
    );

    try {
      const response = await fetch(BANK_OF_CANADA_LATEST_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Bank of Canada HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      if (!isRecord(payload) || !Array.isArray(payload.observations)) {
        throw new Error('Bank of Canada response missing observations');
      }
      const observations = payload.observations as unknown[];

      for (
        let index = observations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const observation: unknown = observations[index];
        if (!isRecord(observation) || typeof observation.d !== 'string') {
          continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.d)) {
          continue;
        }

        const seriesValue = observation[BANK_OF_CANADA_SERIES];
        if (!isRecord(seriesValue)) {
          continue;
        }

        const rawValue = seriesValue.v;
        const cnyToCadRate =
          typeof rawValue === 'string' || typeof rawValue === 'number'
            ? Number(rawValue)
            : Number.NaN;
        if (!Number.isFinite(cnyToCadRate) || cnyToCadRate <= 0) {
          continue;
        }

        return { date: observation.d, cnyToCadRate };
      }

      throw new Error(
        'Bank of Canada response has no valid recent exchange rate',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private toCadCnyRateHundredths(cnyToCadRate: number): number {
    const rateHundredths = Math.round((1 / cnyToCadRate) * 100);
    if (!Number.isSafeInteger(rateHundredths) || rateHundredths <= 0) {
      throw new Error('Calculated CAD/CNY exchange rate is invalid');
    }
    return rateHundredths;
  }

  private getStoreClock(now: Date, timeZone: string): StoreClock {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: 'year' | 'month' | 'day' | 'hour'): string =>
      parts.find((entry) => entry.type === type)?.value ?? '';

    const year = part('year');
    const month = part('month');
    const day = part('day');
    const hour = Number(part('hour'));
    if (!year || !month || !day || !Number.isInteger(hour)) {
      throw new Error('Unable to resolve POS store clock');
    }

    return { date: `${year}-${month}-${day}`, hour };
  }

  private isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  private formatRate(rateHundredths: number): string {
    return (rateHundredths / 100).toFixed(2);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message;
    return 'unknown';
  }
}
