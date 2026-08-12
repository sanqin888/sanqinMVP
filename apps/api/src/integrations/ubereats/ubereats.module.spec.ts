import { MODULE_METADATA } from '@nestjs/common/constants';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { UberEatsMenuModule } from './modules/menu.module';
import { UberEatsMerchantModule } from './modules/merchant.module';
import { UberEatsOperationsModule } from './modules/operations.module';
import { UberEatsOrdersModule } from './modules/orders.module';
import { UberEatsModule } from './ubereats.module';

const metadata = <T>(module: object, key: string): T[] => {
  const value: unknown = Reflect.getMetadata(key, module);
  return Array.isArray(value) ? (value as T[]) : [];
};

describe('UberEatsModule', () => {
  it('is the API composition root for all HTTP controllers', () => {
    expect(metadata(UberEatsModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      UberEatsOAuthController,
      UberEatsWebhookController,
      UberEatsOrdersController,
      UberEatsMenuController,
      UberEatsOperationsController,
    ]);
  });

  it('does not export concrete feature modules', () => {
    const exports = metadata(UberEatsModule, MODULE_METADATA.EXPORTS);

    expect(exports).not.toContain(UberEatsMerchantModule);
    expect(exports).not.toContain(UberEatsOrdersModule);
    expect(exports).not.toContain(UberEatsMenuModule);
    expect(exports).not.toContain(UberEatsOperationsModule);
    expect(exports).toEqual([]);
  });
});
