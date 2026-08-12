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
import { UberEatsInfrastructureWorkerModule } from './infrastructure/workers/ubereats-worker.module';
import { UberEatsModule } from './ubereats.module';

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
      metadata(UberEatsInfrastructureWorkerModule, MODULE_METADATA.CONTROLLERS),
    ).toEqual([]);
  });

  it('does not start polling workers in the API composition', () => {
    const providers = metadata(UberEatsModule, MODULE_METADATA.PROVIDERS);

    expect(providers).not.toContain(UberWebhookInboxWorkerAdapter);
    expect(providers).not.toContain(UberOrderActionWorkerAdapter);
    expect(providers).not.toContain(UberMenuPublishConfirmationWorkerAdapter);
    expect(metadata(UberEatsModule, MODULE_METADATA.IMPORTS)).not.toContain(
      UberEatsInfrastructureWorkerModule,
    );
  });
});
