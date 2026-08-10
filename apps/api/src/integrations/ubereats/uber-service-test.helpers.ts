import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberMenuWorkflowCore } from './uber-menu.workflow';
import { UberMerchantService } from './uber-merchant.service';
import { UberMerchantGateway } from './uber-merchant.gateway';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
  UberMerchantOAuthService,
} from './uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  UberMerchantStoreMappingService,
} from './uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  UberMerchantProvisioningService,
} from './uber-merchant-provisioning.service';
import { UberOperationsService } from './uber-operations.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { UberOrderService } from './uber-order.service';
import { UberWebhookService } from './uber-webhook.service';
import { UberApiGatewayTransport } from '../../infrastructure/uber-api/uber-api.gateway';
import {
  UberMenuGateway,
  UberOrderGateway,
} from '../../infrastructure/uber-api/uber-resource.gateways';

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

type MenuArgs = ConstructorParameters<typeof UberMenuWorkflowCore>;
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
  return new UberMenuWorkflowCore(
    prisma,
    auth,
    gateway,
    resolvedConfig,
    new UberPrismaAccessService(prisma),
    rawHttp,
  );
}

type MerchantArgs = ConstructorParameters<typeof UberMerchantGateway>;
export function createUberMerchantService(
  prisma: MerchantArgs[0],
  auth: MerchantArgs[1],
  http?: MerchantArgs[2],
  settings?: MerchantArgs[3],
) {
  const internal = new UberMerchantGateway(
    prisma,
    auth,
    httpClient(http),
    settings ?? config(),
    new UberPrismaAccessService(prisma),
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

type OrderArgs = ConstructorParameters<typeof UberOrderService>;
export function createUberOrderService(
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
  return new UberOrderService(
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

type WebhookArgs = ConstructorParameters<typeof UberWebhookService>;
export function createUberWebhookService(
  prisma: WebhookArgs[0],
  settings?: WebhookArgs[1],
  orders?: WebhookArgs[2],
  menu?: WebhookArgs[3],
) {
  return new UberWebhookService(
    prisma,
    settings ?? config(),
    missing(orders),
    missing(menu),
    new UberPrismaAccessService(prisma),
  );
}

type OperationsArgs = ConstructorParameters<typeof UberOperationsService>;
export function createUberOperationsService(
  prisma: OperationsArgs[0],
  orders?: OperationsArgs[1],
  menu?: OperationsArgs[2],
  merchant?: OperationsArgs[3],
) {
  return new UberOperationsService(
    prisma,
    missing(orders),
    missing(menu),
    missing(merchant),
    new UberPrismaAccessService(prisma),
  );
}
