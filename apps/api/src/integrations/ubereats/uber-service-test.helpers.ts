import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberMenuService } from './uber-menu.service';
import { UberMerchantService } from './uber-merchant.service';
import { UberOperationsService } from './uber-operations.service';
import { UberOrderService } from './uber-order.service';
import { UberWebhookService } from './uber-webhook.service';

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

type MenuArgs = ConstructorParameters<typeof UberMenuService>;
export function createUberMenuService(
  prisma: MenuArgs[0],
  auth: MenuArgs[1],
  events?: MenuArgs[2],
  ingestion?: MenuArgs[3],
  http?: MenuArgs[4],
  settings?: MenuArgs[5],
) {
  return new UberMenuService(
    prisma,
    auth,
    missing(events),
    missing(ingestion),
    httpClient(http),
    settings ?? config(),
  );
}

type MerchantArgs = ConstructorParameters<typeof UberMerchantService>;
export function createUberMerchantService(
  prisma: MerchantArgs[0],
  auth: MerchantArgs[1],
  events?: MerchantArgs[2],
  ingestion?: MerchantArgs[3],
  http?: MerchantArgs[4],
  settings?: MerchantArgs[5],
) {
  return new UberMerchantService(
    prisma,
    auth,
    missing(events),
    missing(ingestion),
    httpClient(http),
    settings ?? config(),
  );
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
  return new UberOrderService(
    prisma,
    auth,
    eventBus,
    ingestionService,
    httpClient(http),
    settings ?? config(),
  );
}

type WebhookArgs = ConstructorParameters<typeof UberWebhookService>;
export function createUberWebhookService(
  prisma: WebhookArgs[0],
  auth: WebhookArgs[1],
  events?: WebhookArgs[2],
  ingestion?: WebhookArgs[3],
  http?: WebhookArgs[4],
  settings?: WebhookArgs[5],
  orders?: WebhookArgs[6],
  menu?: WebhookArgs[7],
) {
  return new UberWebhookService(
    prisma,
    auth,
    missing(events),
    missing(ingestion),
    httpClient(http),
    settings ?? config(),
    missing(orders),
    missing(menu),
  );
}

type OperationsArgs = ConstructorParameters<typeof UberOperationsService>;
export function createUberOperationsService(
  prisma: OperationsArgs[0],
  auth: OperationsArgs[1],
  events?: OperationsArgs[2],
  ingestion?: OperationsArgs[3],
  http?: OperationsArgs[4],
  settings?: OperationsArgs[5],
  orders?: OperationsArgs[6],
  menu?: OperationsArgs[7],
  merchant?: OperationsArgs[8],
) {
  return new UberOperationsService(
    prisma,
    auth,
    missing(events),
    missing(ingestion),
    httpClient(http),
    settings ?? config(),
    missing(orders),
    missing(menu),
    missing(merchant),
  );
}
