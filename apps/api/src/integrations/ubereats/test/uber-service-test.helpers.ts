import type { UberMenuAvailabilityUseCase } from '../application/menu/uber-menu-availability.use-case';
import type { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import type { SyncUberStoreStatusUseCase } from '../application/merchant/uber-merchant-provisioning.service';
import type { ImportUberOrderUseCase } from '../application/orders/uber-order.use-cases';
import { SyncUberOrderStatusUseCase } from '../application/orders/uber-order.use-cases';
import type { UberOrderSyncPort } from '../application/ports/uber-use-case.ports';
import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';
import type { UberWebhookInboxPort } from '../application/ports/uber-order-processing.ports';
import type { UberConfigService } from '../infrastructure/config/uber-config.service';
import { HmacUberWebhookSignatureVerifier } from '../infrastructure/crypto/uber-webhook-signature-verifier';
import { UberOperationsPrismaAdapter } from '../infrastructure/operations/uber-operations-prisma.adapter';
import { UberPrismaAccessService } from '../infrastructure/persistence/uber-prisma-access.service';

const missing = <T>(): T => undefined as T;

export function createUberOperationsPrismaAdapter(
  prisma: ConstructorParameters<typeof UberOperationsPrismaAdapter>[0],
  orders?: UberOrderSyncPort,
  menu?: UberMenuAvailabilityUseCase,
  store?: SyncUberStoreStatusUseCase,
) {
  return new UberOperationsPrismaAdapter(
    prisma,
    orders ? new SyncUberOrderStatusUseCase(orders) : missing(),
    missing<PublishUberMenuUseCase>(),
    menu ?? missing<UberMenuAvailabilityUseCase>(),
    store ?? missing<SyncUberStoreStatusUseCase>(),
    new UberPrismaAccessService(prisma),
  );
}

export function createReceiveUberWebhookUseCase(
  prisma: ConstructorParameters<typeof UberPrismaAccessService>[0],
  config: UberConfigService,
  orders: ImportUberOrderUseCase,
  menu?: PublishUberMenuUseCase,
) {
  void orders;
  void menu;
  const access = new UberPrismaAccessService(prisma);
  const inbox: UberWebhookInboxPort = {
    async enqueue(input) {
      await access.uberWebhookInboxRepository.create({
        data: { ...input, status: 'PENDING', payload: input.payload as never },
      });
      return true;
    },
    claimDue: () => Promise.resolve([]),
    markSucceeded: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    setStoreProvisioned: () => Promise.resolve(false),
  };
  return new ReceiveUberWebhookUseCase(
    inbox,
    new HmacUberWebhookSignatureVerifier(config),
    { captureEvent: () => Promise.resolve(), workflowLog: () => undefined },
  );
}
