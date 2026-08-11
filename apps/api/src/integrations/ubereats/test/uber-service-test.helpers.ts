import type { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import type { ImportUberOrderUseCase } from '../application/orders/uber-order.use-cases';
import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';
import type { UberWebhookInboxPort } from '../application/ports/uber-order-processing.ports';
import type { UberConfigService } from '../infrastructure/config/uber-config.service';
import { HmacUberWebhookSignatureVerifier } from '../infrastructure/crypto/uber-webhook-signature-verifier';
import { UberPrismaAccessService } from '../infrastructure/persistence/uber-prisma-access.service';

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
    markUnsupported: () => Promise.resolve(),
    requeueUnsupported: () => Promise.resolve(0),
    markFailed: () => Promise.resolve(),
    setStoreProvisioned: () => Promise.resolve(false),
  };
  return new ReceiveUberWebhookUseCase(
    inbox,
    new HmacUberWebhookSignatureVerifier(config),
    { captureEvent: () => Promise.resolve(), workflowLog: () => undefined },
  );
}
