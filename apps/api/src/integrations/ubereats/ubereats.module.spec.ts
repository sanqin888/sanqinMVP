import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  BrandStoreConfigModule,
  BrandStoreConfigUnavailableError,
} from '../../store/public-api';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
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
        .mockRejectedValue(new BrandStoreConfigUnavailableError('missing config')),
    };
    const missingQuery = provider!.useFactory!(missingReader as never);

    await expect(
      missingQuery.getStoreAllergyPolicy('missing-store'),
    ).resolves.toEqual({ mode: 'RELAY_ALL', unsupportedAllergens: [] });
    await expect(
      missingQuery.getStoreAutoAcceptOnlineOrders('missing-store'),
    ).resolves.toBe(true);
  });

  it('keeps the worker runtime free of API feature modules', () => {
    const workerRuntime = createUberEatsWorkerRuntimeModule(
      UBER_EATS_WORKER_PROVIDERS,
    );
    const imports = workerRuntime.imports ?? [];

    expect(imports).toEqual([PrismaModule, BrandStoreConfigModule]);
    expect(imports).not.toContain(AuthModule);
    expect(imports).not.toContain(OrdersModule);
    expect(imports).not.toContain(MessagingModule);
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
