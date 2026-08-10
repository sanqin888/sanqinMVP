import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { UberHttpClient } from './infrastructure/uber-api/uber-http.client';
import { UberMenuPrismaAdapter } from './infrastructure/persistence/uber-menu-prisma.adapter';
import { UberMerchantService } from './application/merchant/uber-merchant.service';
import { UberMerchantGateway } from './infrastructure/uber-api/uber-merchant.gateway';
import { UberMerchantWorkflowRepository } from './infrastructure/persistence/uber-merchant.repositories';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
  UberMerchantOAuthService,
} from './application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  UberMerchantStoreMappingService,
} from './application/merchant/uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  UberMerchantProvisioningService,
} from './application/merchant/uber-merchant-provisioning.service';
import { UberOperationsPrismaAdapter } from './infrastructure/persistence/uber-operations-prisma.adapter';
import { UberPrismaAccessService } from './infrastructure/persistence/uber-prisma-access.service';
import { UberOrderPrismaAdapter } from './infrastructure/persistence/uber-order-prisma.adapter';
import { ProcessUberWebhookInboxWorker } from './application/orders/uber-webhook-inbox.worker';
import { UberApiGatewayTransport } from './infrastructure/uber-api/uber-api.gateway';
import {
  UberMenuGateway,
  UberOrderGateway,
} from './infrastructure/uber-api/uber-resource.gateways';

const config = () =>
  new UberConfigService({
    ...process.env,
    UBER_EATS_OAUTH_STATE_SECRET:
      process.env.UBER_EATS_OAUTH_STATE_SECRET ??
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    UBER_EATS_WEBHOOK_SIGNING_KEY:
      process.env.UBER_EATS_WEBHOOK_SIGNING_KEY ?? 'test-webhook-signing-key',
  });

const missing = <T>(value: T | undefined) => value as T;
const httpClient = <T>(value: T | undefined) =>
  value ?? (new UberHttpClient() as T);

type MenuArgs = ConstructorParameters<typeof UberMenuPrismaAdapter>;
export function createUberMenuService(
  prisma: MenuArgs[0],
  auth: MenuArgs[1],
  http?: MenuArgs[2],
  settings?: MenuArgs[3],
) {
  const resolvedConfig = settings ?? config();
  const rawHttp = httpClient(http as unknown as UberHttpClient);
  const gateway = new UberMenuGateway(
    new UberApiGatewayTransport(rawHttp, auth, resolvedConfig),
  );
  return new UberMenuPrismaAdapter(
    prisma,
    auth,
    gateway,
    resolvedConfig,
    new UberPrismaAccessService(prisma),
    rawHttp,
  );
}

export function createUberMerchantService(
  prisma: any,
  auth: any,
  http?: any,
  settings?: any,
) {
  const internal = new UberMerchantGateway(
    new UberMerchantWorkflowRepository(prisma),
    auth,
    httpClient(http),
    settings ?? config(),
    new UberPrismaAccessService(prisma),
    {
      workflowLog: jest.fn(),
      captureEvent: jest.fn().mockResolvedValue(undefined),
    } as never,
  );
  const service = new UberMerchantService(
    new UberMerchantOAuthService(
      new StartUberOAuthUseCase(internal),
      new CompleteUberOAuthUseCase(internal),
    ),
    new UberMerchantStoreMappingService(
      new DiscoverUberStoresUseCase(internal),
      new MapUberStoreUseCase(internal),
    ),
    new UberMerchantProvisioningService(
      new ProvisionUberStoreUseCase(internal),
      new DeprovisionUberStoreUseCase(internal),
      new SyncUberStoreStatusUseCase(internal),
    ),
  );
  Object.assign(service, { internal });
  return service;
}

type OrderArgs = ConstructorParameters<typeof UberOrderPrismaAdapter>;
export function createUberOrderPrismaAdapter(
  prisma: OrderArgs[0],
  auth: OrderArgs[1],
  events?: OrderArgs[2],
  ingestion?: OrderArgs[3],
  http?: OrderArgs[4],
  settings?: OrderArgs[5],
) {
  const eventBus =
    events ??
    ({
      emitOrderPaidVerified: jest.fn(),
      emitOrderAccepted: jest.fn(),
    } as unknown as OrderEventsBus);
  const ingestionService =
    ingestion ?? new OrderIngestionService(prisma, eventBus);
  const resolvedConfig = settings ?? config();
  const rawHttp = httpClient(http as unknown as UberHttpClient);
  const transport = new UberApiGatewayTransport(rawHttp, auth, resolvedConfig);
  return new UberOrderPrismaAdapter(
    prisma,
    auth,
    eventBus,
    ingestionService,
    rawHttp,
    resolvedConfig,
    new UberPrismaAccessService(prisma),
    new UberOrderGateway(transport, resolvedConfig),
  );
}

type WebhookArgs = ConstructorParameters<typeof ProcessUberWebhookInboxWorker>;
export function createProcessUberWebhookInboxWorker(
  prisma: WebhookArgs[0],
  settings?: WebhookArgs[1],
  orders?: WebhookArgs[2],
  menu?: WebhookArgs[3],
) {
  return new ProcessUberWebhookInboxWorker(
    prisma,
    settings ?? config(),
    missing(orders),
    missing(menu),
    new UberPrismaAccessService(prisma),
  );
}

type OperationsArgs = ConstructorParameters<typeof UberOperationsPrismaAdapter>;
export function createUberOperationsPrismaAdapter(
  prisma: OperationsArgs[0],
  orders?: OperationsArgs[1],
  menu?: OperationsArgs[2],
  merchant?: OperationsArgs[3],
) {
  return new UberOperationsPrismaAdapter(
    prisma,
    missing(orders),
    missing(menu),
    missing(merchant),
    new UberPrismaAccessService(prisma),
  );
}
