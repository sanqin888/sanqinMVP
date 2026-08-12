import { MODULE_METADATA } from '@nestjs/common/constants';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { PublishUberMenuUseCase } from './application/menu/publish-uber-menu.use-case';
import { StartUberOAuthUseCase } from './application/merchant/uber-merchant-oauth.service';
import { QueryUberOperationsSummary } from './application/operations/uber-operations.use-cases';
import { RequestUberOrderActionUseCase } from './application/orders/uber-order.use-cases';
import { UberEatsInfrastructureWorkerModule } from './infrastructure/workers/ubereats-worker.module';
import { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';
import { UberEatsModule } from './ubereats.module';

const metadata = <T>(module: object, key: string): T[] => {
  const value: unknown = Reflect.getMetadata(key, module);
  return Array.isArray(value) ? (value as T[]) : [];
};
const providerTokens = (module: object) =>
  metadata<unknown>(module, MODULE_METADATA.PROVIDERS).map((provider) =>
    typeof provider === 'object' && provider !== null && 'provide' in provider
      ? provider.provide
      : provider,
  );

describe('Uber Eats Nest module metadata', () => {
  it('assembles HTTP controllers and all application subdomains in one root', () => {
    expect(metadata(UberEatsModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      UberEatsOAuthController,
      UberEatsWebhookController,
      UberEatsOrdersController,
      UberEatsMenuController,
      UberEatsOperationsController,
    ]);
    expect(providerTokens(UberEatsModule)).toEqual(
      expect.arrayContaining([
        StartUberOAuthUseCase,
        RequestUberOrderActionUseCase,
        PublishUberMenuUseCase,
        QueryUberOperationsSummary,
      ]),
    );
  });

  it('keeps the worker controller-free with explicit private providers', () => {
    expect(
      metadata(UberEatsInfrastructureWorkerModule, MODULE_METADATA.CONTROLLERS),
    ).toEqual([]);
    expect(providerTokens(UberEatsInfrastructureWorkerModule)).toEqual(
      expect.arrayContaining([UberWorkerHealthService]),
    );
    expect(
      metadata(UberEatsInfrastructureWorkerModule, MODULE_METADATA.IMPORTS),
    ).not.toContain(UberEatsModule);
  });
});
