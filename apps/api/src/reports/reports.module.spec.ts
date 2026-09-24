import { MODULE_METADATA } from '@nestjs/common/constants';

import {
  BRAND_STORE_CONFIG_READER,
  STORE_SCHEDULE_READER,
  STORE_STATUS_READER,
  BrandStoreConfigModule,
  StoreStatusModule,
} from '../store/public-api';
import {
  REPORTING_STORE_OPERATING_CONTEXT_QUERY,
  type ReportingStoreOperatingContextQueryPort,
} from './reporting-store-operating-context.contract';
import { ReportsModule } from './reports.module';

function metadata<T>(target: object, key: string): T[] {
  return (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];
}

describe('ReportsModule B5 operating-context composition', () => {
  it('imports only Brand/Store public modules for the operating-context seam', () => {
    const imports = metadata<unknown>(ReportsModule, MODULE_METADATA.IMPORTS);

    expect(imports).toContain(BrandStoreConfigModule);
    expect(imports).toContain(StoreStatusModule);
  });

  it('maps Brand/Store public readers into a Reporting-owned current-configuration contract', async () => {
    const providers = metadata<unknown>(
      ReportsModule,
      MODULE_METADATA.PROVIDERS,
    );
    const provider = providers.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === REPORTING_STORE_OPERATING_CONTEXT_QUERY,
    ) as
      | {
          inject?: unknown[];
          useFactory?: (
            config: never,
            schedule: never,
            status: never,
          ) => ReportingStoreOperatingContextQueryPort;
        }
      | undefined;

    expect(provider?.inject).toEqual([
      BRAND_STORE_CONFIG_READER,
      STORE_SCHEDULE_READER,
      STORE_STATUS_READER,
    ]);
    expect(provider?.useFactory).toBeDefined();

    const config = {
      getStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
        timezone: 'America/Toronto',
        isActive: true,
      }),
    };
    const schedule = {
      listBusinessHours: jest.fn().mockResolvedValue([
        {
          weekday: 4,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ]),
      listHolidays: jest.fn().mockResolvedValue([
        {
          date: '2026-12-25',
          name: 'Christmas Day',
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        },
      ]),
    };
    const status = {
      getCurrentStatus: jest.fn().mockResolvedValue({
        isOpenBySchedule: true,
        isTemporarilyClosed: false,
        timezone: 'America/Toronto',
        today: {
          date: '2026-09-24',
          closeMinutes: 1260,
        },
      }),
    };

    const query = provider!.useFactory!(
      config as never,
      schedule as never,
      status as never,
    );

    await expect(
      query.getStoreOperatingContext('4750_Yonge_Street'),
    ).resolves.toEqual({
      storeStableId: '4750_Yonge_Street',
      timezone: 'America/Toronto',
      isActive: true,
      historyCoverage: 'CURRENT_CONFIGURATION_ONLY',
      businessHours: [
        {
          weekday: 4,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ],
      holidays: [
        {
          date: '2026-12-25',
          name: 'Christmas Day',
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        },
      ],
      currentStatus: {
        isOpenBySchedule: true,
        isTemporarilyClosed: false,
        today: {
          date: '2026-09-24',
          closeMinutes: 1260,
        },
      },
    });

    expect(config.getStoreSnapshot).toHaveBeenCalledWith('4750_Yonge_Street');
    expect(schedule.listBusinessHours).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(schedule.listHolidays).toHaveBeenCalledWith('4750_Yonge_Street');
    expect(status.getCurrentStatus).toHaveBeenCalledWith('4750_Yonge_Street');
  });
});
