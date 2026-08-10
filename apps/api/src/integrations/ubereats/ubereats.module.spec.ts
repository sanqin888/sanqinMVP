import { Test } from '@nestjs/testing';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './application/merchant/uber-auth.service';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { UberEatsModule } from './ubereats.module';
import { UberHttpClient } from './infrastructure/http/uber-http.client';
import { UberMenuService } from './application/menu/uber-menu.service';
import { UberMerchantService } from './application/merchant/uber-merchant.service';
import { UberOperationsService } from './application/operations/uber-operations.service';
import { UberPrismaAccessService } from './infrastructure/persistence/uber-prisma-access.service';
import { UberOrderService } from './application/orders/uber-order.service';
import { UberWebhookService } from './application/orders/uber-webhook.service';

const sharedProviders = [
  PrismaService,
  UberAuthService,
  OrderEventsBus,
  OrderIngestionService,
  UberHttpClient,
  UberConfigService,
  UberPrismaAccessService,
] as const;
const domainProviders = [
  UberOrderService,
  UberMenuService,
  UberMerchantService,
] as const;

const mockProviders = (providers: readonly unknown[]) =>
  providers.map((provide) => ({ provide, useValue: {} }));

describe('UberEatsModule 装配', () => {
  beforeEach(() => {
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'test-webhook-signing-key';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    process.env.GOOGLE_OAUTH_CALLBACK_URL =
      'https://example.com/auth/google/callback';
  });

  afterEach(() => {
    delete process.env.UBER_EATS_OAUTH_STATE_SECRET;
    delete process.env.UBER_EATS_WEBHOOK_SIGNING_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_CALLBACK_URL;
  });

  it.each(sharedProviders)(
    '遗漏必需 provider %p 时领域服务初始化失败',
    async (missing) => {
      const available = sharedProviders.filter(
        (provider) => provider !== missing,
      );
      await expect(
        Test.createTestingModule({
          providers: [UberOrderService, ...mockProviders(available)],
        }).compile(),
      ).rejects.toThrow();
    },
  );

  it.each(domainProviders)(
    '遗漏 operations 必需 provider %p 时初始化失败',
    async (missing) => {
      const available = domainProviders.filter(
        (provider) => provider !== missing,
      );
      await expect(
        Test.createTestingModule({
          providers: [
            UberOperationsService,
            ...mockProviders(sharedProviders),
            ...mockProviders(available),
          ],
        }).compile(),
      ).rejects.toThrow();
    },
  );

  it('完整模块可解析全部领域服务', async () => {
    const module = await Test.createTestingModule({ imports: [UberEatsModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    for (const provider of [
      UberWebhookService,
      UberOrderService,
      UberMenuService,
      UberMerchantService,
      UberOperationsService,
    ]) {
      expect(module.get(provider)).toBeInstanceOf(provider);
    }

    await module.close();
  });
});
