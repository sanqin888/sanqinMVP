// apps/api/src/admin/business-hours/business-hours.service.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  BRAND_STORE_CONFIG_READER,
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
  type BrandStoreConfigReaderPort,
  type StoreBusinessHour,
  type StoreScheduleReaderPort,
  type StoreScheduleWriterPort,
} from '../../store/public-api';
import {
  type BusinessHourDto,
  type WeekdayNumber,
} from './dto/business-hours.dto';

const ALL_WEEKDAYS: WeekdayNumber[] = [0, 1, 2, 3, 4, 5, 6];

const DEFAULT_HOURS: BusinessHourDto[] = [
  { weekday: 0, openMinutes: null, closeMinutes: null, isClosed: true },
  { weekday: 1, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  { weekday: 2, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  { weekday: 3, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  { weekday: 4, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  { weekday: 5, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  { weekday: 6, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
];

@Injectable()
export class BusinessHoursService {
  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
    @Inject(STORE_SCHEDULE_READER)
    private readonly scheduleReader: StoreScheduleReaderPort,
    @Inject(STORE_SCHEDULE_WRITER)
    private readonly scheduleWriter: StoreScheduleWriterPort,
  ) {}

  private async getStoreStableId(): Promise<string> {
    return (await this.brandStoreConfigReader.getStoreSnapshot()).storeStableId;
  }

  private async ensureSeeded(storeStableId: string): Promise<void> {
    const existing = await this.scheduleReader.listBusinessHours(storeStableId);
    if (existing.length > 0) return;

    await this.scheduleWriter.replaceBusinessHours(
      storeStableId,
      DEFAULT_HOURS.map((hour) => ({ ...hour })),
    );
  }

  async getAll(): Promise<BusinessHourDto[]> {
    const storeStableId = await this.getStoreStableId();
    await this.ensureSeeded(storeStableId);

    const rows = await this.scheduleReader.listBusinessHours(storeStableId);
    return rows.map((row) => ({ ...row }));
  }

  async updateAll(hours: BusinessHourDto[]): Promise<BusinessHourDto[]> {
    const seen = new Set<WeekdayNumber>();

    const normalized: StoreBusinessHour[] = hours.map((hour) => {
      if (!ALL_WEEKDAYS.includes(hour.weekday)) {
        throw new Error(`Invalid weekday value: ${hour.weekday}`);
      }
      if (seen.has(hour.weekday)) {
        throw new Error(`Duplicate weekday in payload: ${hour.weekday}`);
      }
      seen.add(hour.weekday);

      if (hour.isClosed) {
        return {
          weekday: hour.weekday,
          openMinutes: null,
          closeMinutes: null,
          isClosed: true,
        };
      }

      const openMinutes = normalizeMinutes(hour.openMinutes);
      const closeMinutes = normalizeMinutes(hour.closeMinutes);
      if (openMinutes === null || closeMinutes === null) {
        throw new Error(
          `openMinutes/closeMinutes required when isClosed = false (weekday=${hour.weekday})`,
        );
      }
      if (openMinutes >= closeMinutes) {
        throw new Error(
          `openMinutes must be < closeMinutes when isClosed = false (weekday=${hour.weekday})`,
        );
      }

      return {
        weekday: hour.weekday,
        openMinutes,
        closeMinutes,
        isClosed: false,
      };
    });

    const storeStableId = await this.getStoreStableId();
    await this.scheduleWriter.replaceBusinessHours(storeStableId, normalized);
    return this.getAll();
  }
}

function normalizeMinutes(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid minutes value: ${value}`);
  }
  const v = Math.round(value);
  if (v < 0 || v >= 24 * 60) {
    throw new Error(`Minutes must be between 0 and 1439, got ${v}`);
  }
  return v;
}
