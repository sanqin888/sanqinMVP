import { MODULE_METADATA } from '@nestjs/common/constants';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './infrastructure/workers/uber-worker.adapters';
import { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';
import { UberEatsWorkerLifecycleModule } from './infrastructure/workers/ubereats-worker.module';
import {
  UBER_EATS_COMPOSITION_PROVIDERS,
  UberEatsCompositionModule,
  UberEatsModule,
} from './ubereats.module';
import { UberEatsWorkerEntryModule } from './worker';

const metadata = <T>(module: object, key: string): T[] => {
  const value: unknown = Reflect.getMetadata(key, module);
  return Array.isArray(value) ? (value as T[]) : [];
};

describe('UberEats compositions', () => {
  it('keeps HTTP controllers exclusively in the API composition', () => {
    expect(metadata(UberEatsModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      UberEatsOAuthController,
      UberEatsWebhookController,
      UberEatsOrdersController,
      UberEatsMenuController,
      UberEatsOperationsController,
    ]);
    expect(
      metadata(UberEatsWorkerLifecycleModule, MODULE_METADATA.CONTROLLERS),
    ).toEqual([]);
  });

  it('does not start polling workers in the API composition', () => {
    const apiProviders = metadata(UberEatsModule, MODULE_METADATA.PROVIDERS);
    const compositionProviders = metadata(
      UberEatsCompositionModule,
      MODULE_METADATA.PROVIDERS,
    );

    for (const providers of [apiProviders, compositionProviders]) {
      expect(providers).not.toContain(UberWebhookInboxWorkerAdapter);
      expect(providers).not.toContain(UberOrderActionWorkerAdapter);
      expect(providers).not.toContain(UberMenuPublishConfirmationWorkerAdapter);
    }
    expect(metadata(UberEatsModule, MODULE_METADATA.IMPORTS)).not.toContain(
      UberEatsWorkerEntryModule,
    );
  });

  it('defines adapter and use-case tokens once in the public composition wiring', () => {
    const providers = metadata<unknown>(
      UberEatsCompositionModule,
      MODULE_METADATA.PROVIDERS,
    );
    const providerToken = (provider: unknown): unknown =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? provider.provide
        : provider;
    const tokens = providers.map(providerToken);

    expect(providers).toBe(UBER_EATS_COMPOSITION_PROVIDERS);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('keeps the worker module limited to lifecycle providers', () => {
    expect(
      metadata(UberEatsWorkerLifecycleModule, MODULE_METADATA.PROVIDERS),
    ).toEqual([
      UberWebhookInboxWorkerAdapter,
      UberOrderActionWorkerAdapter,
      UberMenuPublishConfirmationWorkerAdapter,
      UberWorkerHealthService,
    ]);
    expect(
      metadata(UberEatsWorkerLifecycleModule, MODULE_METADATA.IMPORTS),
    ).toEqual([UberEatsCompositionModule]);
  });
});
