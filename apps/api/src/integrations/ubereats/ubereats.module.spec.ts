import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import {
  ORDER_INGESTION_PROVIDER,
  OrderExternalFactsModule,
  OrdersModule,
} from '../../orders/public-api';
import {
  CATALOG_EXTERNAL_MENU_FACTS_READER,
  CatalogExternalMenuFactsModule,
} from '../../menu/public-api';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  STORE_SCHEDULE_READER,
  BrandStoreConfigModule,
  BrandStoreConfigUnavailableError,
} from '../../store/public-api';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import {
  UBER_BUSINESS_SCHEDULE_QUERY_PORT,
  type UberBusinessScheduleQueryPort,
} from './application/menu/uber-menu-draft.ports';
import {
  UBER_CATALOG_MENU_FACTS_QUERY,
  type UberCatalogMenuFactsQueryPort,
} from './application/shared/uber-catalog-menu-facts.port';
import {
  UBER_STORE_CONFIG_QUERY,
  type UberStoreConfigQueryPort,
} from './application/shared/uber-store-config.port';
import {
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './infrastructure/workers/uber-worker.adapters';
import { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';
import { UberWorkerWakeService } from './infrastructure/workers/uber-worker-wake.service';
import {
  createUberEatsWorkerRuntimeModule,
  UberEatsModule,
} from './ubereats.module';
import { UBER_EATS_WORKER_PROVIDERS } from './worker';

const metadata = <T>(module: object, key: string): T[] => {
  const value: unknown = Reflect.getMetadata(key, module);
  return Array.isArray(value) ? (value as T[]) : [];
};

describe('UberEats compositions', () => {
  it('keeps HTTP controllers exclusively in the single composition root', () => {
    expect(metadata(UberEatsModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      UberEatsOAuthController,
      UberEatsWebhookController,
      UberEatsOrdersController,
      UberEatsMenuController,
      UberEatsOperationsController,
    ]);
  });

  it('keeps the API composition free of the retired Messaging bridge', () => {
    const imports = metadata(UberEatsModule, MODULE_METADATA.IMPORTS);
    expect(imports).toContain(OrdersModule);
    expect(imports).not.toContain(MessagingModule);
  });

  it('does not start polling workers in the API composition', () => {
    const apiProviders = metadata(UberEatsModule, MODULE_METADATA.PROVIDERS);
    expect(apiProviders).not.toContain(UberWebhookInboxWorkerAdapter);
    expect(apiProviders).not.toContain(UberOrderActionWorkerAdapter);
    expect(UBER_EATS_WORKER_PROVIDERS).toEqual([
      UberWebhookInboxWorkerAdapter,
      UberOrderActionWorkerAdapter,
      UberWorkerHealthService,
      UberWorkerWakeService,
    ]);
  });

  it('defines adapter and use-case tokens once in the single composition root', () => {
    const providers = metadata<unknown>(
      UberEatsModule,
      MODULE_METADATA.PROVIDERS,
    );
    const providerToken = (provider: unknown): unknown =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? provider.provide
        : provider;
    const tokens = providers.map(providerToken);

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('maps Uber order store policies through the Brand/Store config reader without changing missing-config fallbacks', async () => {
    const providers = metadata<unknown>(
      UberEatsModule,
      MODULE_METADATA.PROVIDERS,
    );
    const provider = providers.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === UBER_STORE_CONFIG_QUERY,
    ) as
      | {
          useFactory?: (reader: never) => UberStoreConfigQueryPort;
        }
      | undefined;

    expect(provider?.useFactory).toBeDefined();
    const configuredReader = {
      getStoreSnapshot: jest.fn().mockResolvedValue({
        allergyHandlingMode: 'DENY_LIST',
        unsupportedAllergens: ['PEANUTS'],
        autoAcceptOnlineOrders: false,
      }),
    };
    const configuredQuery = provider!.useFactory!(configuredReader as never);

    await expect(
      configuredQuery.getStoreAllergyPolicy('4750_Yonge_Street'),
    ).resolves.toEqual({
      mode: 'DENY_LIST',
      unsupportedAllergens: ['PEANUTS'],
    });
    await expect(
      configuredQuery.getStoreAutoAcceptOnlineOrders('4750_Yonge_Street'),
    ).resolves.toBe(false);

    const missingReader = {
      getStoreSnapshot: jest
        .fn()
        .mockRejectedValue(
          new BrandStoreConfigUnavailableError('missing config'),
        ),
    };
    const missingQuery = provider!.useFactory!(missingReader as never);

    await expect(
      missingQuery.getStoreAllergyPolicy('missing-store'),
    ).resolves.toEqual({ mode: 'RELAY_ALL', unsupportedAllergens: [] });
    await expect(
      missingQuery.getStoreAutoAcceptOnlineOrders('missing-store'),
    ).resolves.toBe(true);
  });

  it('maps Uber menu business schedules through the Store public schedule reader', async () => {
    const providers = metadata<unknown>(
      UberEatsModule,
      MODULE_METADATA.PROVIDERS,
    );
    const provider = providers.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === UBER_BUSINESS_SCHEDULE_QUERY_PORT,
    ) as
      | {
          inject?: unknown[];
          useFactory?: (
            storeConfig: never,
            scheduleReader: never,
          ) => UberBusinessScheduleQueryPort;
        }
      | undefined;

    expect(provider?.inject).toEqual([
      UBER_STORE_CONFIG_QUERY,
      STORE_SCHEDULE_READER,
    ]);
    expect(provider?.useFactory).toBeDefined();

    const storeConfig = {
      getStoreConfig: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
        salesTaxRate: 0.13,
      }),
    };
    const scheduleReader = {
      listBusinessHours: jest.fn().mockResolvedValue([
        {
          weekday: 1,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ]),
    };
    const query = provider!.useFactory!(
      storeConfig as never,
      scheduleReader as never,
    );

    await expect(
      query.readBusinessSchedule('4750_Yonge_Street'),
    ).resolves.toEqual({
      timezone: 'America/Toronto',
      salesTaxRate: 0.13,
      hours: [
        {
          weekday: 1,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ],
    });
    expect(storeConfig.getStoreConfig).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(scheduleReader.listBusinessHours).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
  });

  it('maps Catalog-owned menu facts into the Uber application boundary', async () => {
    const providers = metadata<unknown>(
      UberEatsModule,
      MODULE_METADATA.PROVIDERS,
    );
    const provider = providers.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === UBER_CATALOG_MENU_FACTS_QUERY,
    ) as
      | {
          inject?: unknown[];
          useFactory?: (reader: never) => UberCatalogMenuFactsQueryPort;
        }
      | undefined;

    expect(provider?.inject).toEqual([CATALOG_EXTERNAL_MENU_FACTS_READER]);
    const tempUnavailableUntil = '2090-01-02T03:04:05.000Z';
    const reader = {
      readMenuSource: jest.fn().mockResolvedValue({
        categories: [],
        items: [
          {
            stableId: 'item-1',
            categoryStableId: 'category-1',
            tempUnavailableUntil,
            optionGroups: [],
          },
        ],
        modifierGroups: [
          {
            stableId: 'group-1',
            options: [
              {
                stableId: 'option-1',
                tempUnavailableUntil,
                childTemplateGroupStableIds: [],
              },
            ],
          },
        ],
      }),
      getMenuItemSource: jest.fn(),
      getOptionSource: jest.fn(),
      getModifierGroupSource: jest.fn(),
      listOrderModifierSnapshotSources: jest.fn(),
    };
    const query = provider!.useFactory!(reader as never);

    await expect(query.readMenuSource()).resolves.toMatchObject({
      menuItems: [
        {
          stableId: 'item-1',
          categoryStableId: 'category-1',
          tempUnavailableUntil: new Date(tempUnavailableUntil),
        },
      ],
      modifierTemplates: [
        {
          stableId: 'group-1',
          options: [
            {
              stableId: 'option-1',
              tempUnavailableUntil: new Date(tempUnavailableUntil),
            },
          ],
        },
      ],
    });
  });

  it('keeps the worker runtime free of API feature modules', () => {
    const workerRuntime = createUberEatsWorkerRuntimeModule(
      UBER_EATS_WORKER_PROVIDERS,
    );
    const imports = workerRuntime.imports ?? [];

    expect(imports).toEqual([
      PrismaModule,
      BrandStoreConfigModule,
      CatalogExternalMenuFactsModule,
      OrderExternalFactsModule,
    ]);
    expect(imports).not.toContain(AuthModule);
    expect(imports).not.toContain(OrdersModule);
    expect(imports).not.toContain(MessagingModule);
    expect(workerRuntime.providers ?? []).toContain(ORDER_INGESTION_PROVIDER);
    expect(workerRuntime.controllers ?? []).toEqual([]);
  });

  it('keeps worker lifecycle providers outside the HTTP composition', () => {
    expect(UBER_EATS_WORKER_PROVIDERS).toEqual([
      UberWebhookInboxWorkerAdapter,
      UberOrderActionWorkerAdapter,
      UberWorkerHealthService,
      UberWorkerWakeService,
    ]);
  });
});
