import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../application/shared/uber-telemetry.port';
import type { Provider } from '@nestjs/common';
import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';
import { ProcessUberWebhookInboxUseCase } from '../application/orders/process-uber-webhook-inbox.use-case';
import { ReplayUnsupportedUberWebhooksUseCase } from '../application/orders/replay-unsupported-uber-webhooks.use-case';
import { UberOrderActionService } from '../application/orders/uber-order-action.service';
import { UberOrderOutboxService } from '../application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from '../application/orders/uber-order-status-sync.service';
import {
  CancelUberOrderUseCase,
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from '../application/orders/uber-order.use-cases';
import { SyncUberOrderStatusUseCase } from '../application/orders/sync-uber-order-status.use-case';
import { ListPendingUberOrdersQuery } from '../application/orders/list-pending-uber-orders.query';
import {
  type UberOrderDetailGatewayPort,
  UBER_ORDER_ACTION_GATEWAY,
  UBER_ORDER_DETAIL_GATEWAY,
} from '../application/orders/uber-order-api.ports';
import {
  type UberOrderOutboxPort,
  type UberOrderStatusAuditPort,
  type UberWebhookInboxPort,
  type UberWebhookSignatureVerifier,
  UBER_ORDER_OUTBOX_PORT,
  UBER_ORDER_STATUS_AUDIT_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../application/orders/uber-order-processing.ports';
import {
  type UberOrderActionQueuePort,
  type UberOrderSyncRepositoryPort,
  type UberOrderSyncUnitOfWorkPort,
  UBER_ORDER_SYNC_REPOSITORY,
  UBER_ORDER_SYNC_UNIT_OF_WORK,
} from '../application/orders/uber-order-sync.ports';
import {
  type UberOrderActionGatewayPort,
  type UberOrderActionRepositoryPort,
  type UberOrderImportRepositoryPort,
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from '../application/orders/uber-order.ports';
import { UBER_ORDER_IMPORT_PORT } from '../application/orders/uber-order.ports';
import { UberOrderActionPrismaAdapter } from '../infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from '../infrastructure/persistence/uber-order-import-prisma.adapter';
import {
  UberOrderOutboxPrismaAdapter,
  UberOrderStatusAuditPrismaAdapter,
} from '../infrastructure/persistence/uber-order-outbox-prisma.adapter';
import {
  UberOrderSyncPrismaRepository,
  UberOrderSyncPrismaUnitOfWork,
} from '../infrastructure/persistence/uber-order-sync-prisma.repository';
import { UberOrderActionGatewayAdapter } from '../infrastructure/uber-api/uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from '../infrastructure/uber-api/uber-order-detail.gateway';
import { UberOrderGateway } from '../infrastructure/uber-api/uber-resource.gateways';
import { UberMenuNotificationHandler } from '../application/menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../application/merchant/uber-merchant-webhook.handler';
import {
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
} from '../public-api';
import { presentOrderAction } from './public-contract.mappers';
import {
  type UberStoreMappingRepositoryPort,
  UBER_STORE_MAPPING_REPOSITORY,
} from '../application/merchant/uber-merchant-persistence.ports';

export const UBER_EATS_ORDER_PROVIDERS: Provider[] = [
  UberOrderGateway,
  { provide: UBER_ORDER_ACTION_GATEWAY, useExisting: UberOrderGateway },
  UberOrderDetailGatewayAdapter,
  {
    provide: UBER_ORDER_DETAIL_GATEWAY,
    useExisting: UberOrderDetailGatewayAdapter,
  },
  UberOrderActionGatewayAdapter,
  {
    provide: UBER_ORDER_ACTION_COMMAND_GATEWAY,
    useExisting: UberOrderActionGatewayAdapter,
  },
  UberOrderActionPrismaAdapter,
  {
    provide: UBER_ORDER_ACTION_REPOSITORY,
    useExisting: UberOrderActionPrismaAdapter,
  },
  UberOrderImportPrismaAdapter,
  {
    provide: UBER_ORDER_IMPORT_REPOSITORY,
    useExisting: UberOrderImportPrismaAdapter,
  },
  UberOrderOutboxPrismaAdapter,
  {
    provide: UBER_ORDER_OUTBOX_PORT,
    useExisting: UberOrderOutboxPrismaAdapter,
  },
  UberOrderStatusAuditPrismaAdapter,
  {
    provide: UBER_ORDER_STATUS_AUDIT_PORT,
    useExisting: UberOrderStatusAuditPrismaAdapter,
  },
  UberOrderSyncPrismaRepository,
  {
    provide: UBER_ORDER_SYNC_REPOSITORY,
    useExisting: UberOrderSyncPrismaRepository,
  },
  UberOrderSyncPrismaUnitOfWork,
  {
    provide: UBER_ORDER_SYNC_UNIT_OF_WORK,
    useExisting: UberOrderSyncPrismaUnitOfWork,
  },
  {
    provide: ReceiveUberWebhookUseCase,
    inject: [
      UBER_WEBHOOK_INBOX_PORT,
      UBER_WEBHOOK_SIGNATURE_VERIFIER,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      inbox: UberWebhookInboxPort,
      signatures: UberWebhookSignatureVerifier,
      telemetry: UberTelemetryPort,
    ) => new ReceiveUberWebhookUseCase(inbox, signatures, telemetry),
  },
  {
    provide: ReplayUnsupportedUberWebhooksUseCase,
    inject: [UBER_WEBHOOK_INBOX_PORT],
    useFactory: (inbox: UberWebhookInboxPort) =>
      new ReplayUnsupportedUberWebhooksUseCase(inbox),
  },
  {
    provide: UberOrderActionService,
    inject: [UBER_ORDER_ACTION_REPOSITORY, UBER_ORDER_ACTION_COMMAND_GATEWAY],
    useFactory: (
      repository: UberOrderActionRepositoryPort,
      gateway: UberOrderActionGatewayPort,
    ) => new UberOrderActionService(repository, gateway),
  },
  {
    provide: UberOrderStatusSyncService,
    inject: [UBER_ORDER_STATUS_AUDIT_PORT],
    useFactory: (audit: UberOrderStatusAuditPort) =>
      new UberOrderStatusSyncService(audit),
  },
  {
    provide: UberOrderOutboxService,
    inject: [UBER_ORDER_OUTBOX_PORT],
    useFactory: (outbox: UberOrderOutboxPort) =>
      new UberOrderOutboxService(outbox),
  },
  {
    provide: ImportUberOrderUseCase,
    inject: [
      UBER_ORDER_IMPORT_REPOSITORY,
      UBER_ORDER_DETAIL_GATEWAY,
      UberOrderActionService,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      repository: UberOrderImportRepositoryPort,
      gateway: UberOrderDetailGatewayPort,
      actions: UberOrderActionService,
      storeMappings: UberStoreMappingRepositoryPort,
    ) =>
      new ImportUberOrderUseCase(repository, gateway, actions, storeMappings),
  },
  { provide: UBER_ORDER_IMPORT_PORT, useExisting: ImportUberOrderUseCase },
  {
    provide: CancelUberOrderUseCase,
    inject: [
      UBER_ORDER_IMPORT_REPOSITORY,
      UBER_ORDER_DETAIL_GATEWAY,
      UberOrderActionService,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      repository: UberOrderImportRepositoryPort,
      gateway: UberOrderDetailGatewayPort,
      actions: UberOrderActionService,
      storeMappings: UberStoreMappingRepositoryPort,
    ) =>
      new CancelUberOrderUseCase(repository, gateway, actions, storeMappings),
  },
  {
    provide: RequestUberOrderActionUseCase,
    inject: [UberOrderActionService],
    useFactory: (actions: UberOrderActionService) =>
      new RequestUberOrderActionUseCase(actions),
  },
  {
    provide: UBER_EATS_ORDER_ACTIONS,
    inject: [RequestUberOrderActionUseCase],
    useFactory: (actions: RequestUberOrderActionUseCase) => ({
      accept: async (id: string) =>
        presentOrderAction(await actions.accept(id)),
      retryReadyForPickup: async (id: string) =>
        presentOrderAction(await actions.retryReadyForPickup(id)),
      getReadyForPickupAction: async (id: string) =>
        presentOrderAction(await actions.getReadyForPickupAction(id)),
    }),
  },
  {
    provide: ExecuteUberOrderActionWorker,
    inject: [UberOrderActionService],
    useFactory: (actions: UberOrderActionService) =>
      new ExecuteUberOrderActionWorker(actions),
  },
  {
    provide: SyncUberOrderStatusUseCase,
    inject: [
      UBER_ORDER_SYNC_REPOSITORY,
      UBER_ORDER_SYNC_UNIT_OF_WORK,
      UBER_ORDER_OUTBOX_PORT,
      UberOrderStatusSyncService,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      orders: UberOrderSyncRepositoryPort,
      unitOfWork: UberOrderSyncUnitOfWorkPort,
      queue: UberOrderActionQueuePort,
      statusSync: UberOrderStatusSyncService,
      telemetry: UberTelemetryPort,
    ) =>
      new SyncUberOrderStatusUseCase(
        orders,
        unitOfWork,
        queue,
        statusSync,
        telemetry,
      ),
  },
  {
    provide: UBER_EATS_ORDER_STATUS_SYNC,
    useExisting: SyncUberOrderStatusUseCase,
  },
  {
    provide: ListPendingUberOrdersQuery,
    inject: [UBER_ORDER_SYNC_REPOSITORY],
    useFactory: (orders: UberOrderSyncRepositoryPort) =>
      new ListPendingUberOrdersQuery(orders),
  },
  {
    provide: ProcessUberWebhookInboxUseCase,
    inject: [
      UBER_WEBHOOK_INBOX_PORT,
      ImportUberOrderUseCase,
      UberMenuNotificationHandler,
      HandleUberMerchantWebhookHandler,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      inbox: UberWebhookInboxPort,
      orders: ImportUberOrderUseCase,
      menu: UberMenuNotificationHandler,
      merchant: HandleUberMerchantWebhookHandler,
      telemetry: UberTelemetryPort,
    ) =>
      new ProcessUberWebhookInboxUseCase(
        inbox,
        orders,
        menu,
        merchant,
        telemetry,
      ),
  },
];

export const UBER_EATS_ORDER_EXPORTS = [
  ReceiveUberWebhookUseCase,
  ProcessUberWebhookInboxUseCase,
  ReplayUnsupportedUberWebhooksUseCase,
  ExecuteUberOrderActionWorker,
  RequestUberOrderActionUseCase,
  SyncUberOrderStatusUseCase,
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
  ListPendingUberOrdersQuery,
];
