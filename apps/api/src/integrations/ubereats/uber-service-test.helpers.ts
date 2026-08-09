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
  http?: MenuArgs[2],
  settings?: MenuArgs[3],
) {
  return new UberMenuService(
    prisma,
    auth,
    httpClient(http),
    settings ?? config(),
  );
}

type MerchantArgs = ConstructorParameters<typeof UberMerchantService>;
export function createUberMerchantService(
  prisma: MerchantArgs[0],
  auth: MerchantArgs[1],
  http?: MerchantArgs[2],
  settings?: MerchantArgs[3],
) {
  return new UberMerchantService(
    prisma,
    auth,
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
  settings?: WebhookArgs[1],
  orders?: WebhookArgs[2],
  menu?: WebhookArgs[3],
) {
  return new UberWebhookService(
    prisma,
    settings ?? config(),
    missing(orders),
    missing(menu),
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
  );
}
