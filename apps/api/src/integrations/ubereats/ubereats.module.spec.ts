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
import { UberEatsInfrastructureWorkerModule } from './composition/ubereats-worker.module';
import { UberEatsMenuModule } from './modules/menu.module';
import { UberEatsMerchantModule } from './modules/merchant.module';
import { UberEatsOperationsModule } from './modules/operations.module';
import { UberEatsOrdersModule } from './modules/orders.module';
import { UberEatsHttpModule } from './modules/ubereats-http.module';
import { UberEatsInternalInfrastructureModule } from './modules/ubereats-internal-infrastructure.module';

const metadata = <T>(module: object, key: string): T[] =>
  Reflect.getMetadata(key, module) ?? [];

const providerTokens = (module: object) =>
  metadata<unknown>(module, MODULE_METADATA.PROVIDERS).map((provider: any) =>
    typeof provider === 'function' ? provider : provider.provide,
  );

describe('Uber Eats Nest module metadata', () => {
  const controllers = [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ];
  const domains = [
    { module: UberEatsMerchantModule, own: StartUberOAuthUseCase },
    { module: UberEatsOrdersModule, own: RequestUberOrderActionUseCase },
    { module: UberEatsMenuModule, own: PublishUberMenuUseCase },
    { module: UberEatsOperationsModule, own: QueryUberOperationsSummary },
  ];

  it.each(domains)(
    '$module.name registers and exports only its own application providers',
    ({ module, own }) => {
      const providers = providerTokens(module);
      const exports = metadata<unknown>(module, MODULE_METADATA.EXPORTS);
      expect(providers).toContain(own);
      expect(exports).toContain(own);
      for (const foreign of domains.filter(
        (domain) => domain.module !== module,
      )) {
        expect(providers).not.toContain(foreign.own);
        expect(exports).not.toContain(foreign.module);
        expect(exports).not.toContain(foreign.own);
      }
      expect(metadata(module, MODULE_METADATA.CONTROLLERS)).toEqual([]);
    },
  );

  it('keeps every HTTP controller in the HTTP composition module', () => {
    expect(metadata(UberEatsHttpModule, MODULE_METADATA.CONTROLLERS)).toEqual(
      controllers,
    );
    expect(metadata(UberEatsHttpModule, MODULE_METADATA.IMPORTS)).toEqual([
      UberEatsMerchantModule,
      UberEatsOrdersModule,
      UberEatsMenuModule,
      UberEatsOperationsModule,
    ]);
  });

  it('exports only explicit infrastructure dependencies', () => {
    const exports = metadata(
      UberEatsInternalInfrastructureModule,
      MODULE_METADATA.EXPORTS,
    );
    expect(exports).not.toContain(UberEatsMerchantModule);
    expect(exports).not.toContain(UberEatsOrdersModule);
    expect(exports).not.toContain(UberEatsMenuModule);
    expect(exports).not.toContain(UberEatsOperationsModule);
  });

  it('keeps the worker controller-free and detached from HTTP feature modules', () => {
    const imports = metadata(
      UberEatsInfrastructureWorkerModule,
      MODULE_METADATA.IMPORTS,
    );
    expect(
      metadata(UberEatsInfrastructureWorkerModule, MODULE_METADATA.CONTROLLERS),
    ).toEqual([]);
    expect(imports).toContain(UberEatsInternalInfrastructureModule);
    expect(imports).not.toContain(UberEatsHttpModule);
    expect(imports).not.toContain(UberEatsMerchantModule);
    expect(imports).not.toContain(UberEatsOrdersModule);
    expect(imports).not.toContain(UberEatsMenuModule);
    expect(imports).not.toContain(UberEatsOperationsModule);
  });
});
