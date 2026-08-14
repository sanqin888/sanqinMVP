import type { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import type { ImportUberOrderUseCase } from '../application/orders/uber-order.use-cases';
import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';
import type { UberWebhookInboxPort } from '../application/orders/uber-order-processing.ports';
import type { UberCryptoConfigService } from '../infrastructure/crypto/uber-crypto-config.service';
import { HmacUberWebhookSignatureVerifier } from '../infrastructure/crypto/uber-webhook-signature-verifier';

type WebhookInboxTestPrisma = {
  uberWebhookInbox: {
    create(input: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export function createReceiveUberWebhookUseCase(
  prisma: WebhookInboxTestPrisma,
  config: UberCryptoConfigService,
  orders: ImportUberOrderUseCase,
  menu?: PublishUberMenuUseCase,
) {
  void orders;
  void menu;
  const inbox: UberWebhookInboxPort = {
    async enqueue(input) {
      await prisma.uberWebhookInbox.create({
        data: { ...input, status: 'PENDING', payload: input.payload as never },
      });
      return true;
    },
    claimDue: () => Promise.resolve([]),
    markSucceeded: () => Promise.resolve(true),
    markUnsupported: () => Promise.resolve(true),
    requeueUnsupported: () => Promise.resolve(0),
    markFailed: () => Promise.resolve(true),
    setStoreProvisioned: () => Promise.resolve(false),
  };
  return new ReceiveUberWebhookUseCase(
    inbox,
    new HmacUberWebhookSignatureVerifier(config),
    { captureEvent: () => Promise.resolve(), workflowLog: () => undefined },
  );
}
