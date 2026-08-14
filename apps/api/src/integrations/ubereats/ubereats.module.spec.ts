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
import {
  UBER_EATS_COMPOSITION_PROVIDERS,
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
    expect(apiProviders).not.toContain(
      UberMenuPublishConfirmationWorkerAdapter,
    );
    expect(UBER_EATS_WORKER_PROVIDERS).toEqual([
      UberWebhookInboxWorkerAdapter,
      UberOrderActionWorkerAdapter,
      UberMenuPublishConfirmationWorkerAdapter,
      UberWorkerHealthService,
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

    expect(providers).toBe(UBER_EATS_COMPOSITION_PROVIDERS);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('keeps worker lifecycle providers outside the HTTP composition', () => {
    expect(UBER_EATS_WORKER_PROVIDERS).toEqual([
      UberWebhookInboxWorkerAdapter,
      UberOrderActionWorkerAdapter,
      UberMenuPublishConfirmationWorkerAdapter,
      UberWorkerHealthService,
    ]);
  });
});
