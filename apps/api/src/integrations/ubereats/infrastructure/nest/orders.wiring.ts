import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../../application/shared/uber-telemetry.port';
import type { Provider } from '@nestjs/common';
import { ReceiveUberWebhookUseCase } from '../../application/orders/uber-webhook-receiver.use-case';
import { ProcessUberWebhookInboxUseCase } from '../../application/orders/process-uber-webhook-inbox.use-case';
import { ReplayUnsupportedUberWebhooksUseCase } from '../../application/orders/replay-unsupported-uber-webhooks.use-case';
import { UberOrderActionService } from '../../application/orders/uber-order-action.service';
import { UberOrderStatusSyncService } from '../../application/orders/uber-order-status-sync.service';
import {
  CancelUberOrderUseCase,
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from '../../application/orders/uber-order.use-cases';
import { SyncUberOrderStatusUseCase } from '../../application/orders/sync-uber-order-status.use-case';
import { ListPendingUberOrdersQuery } from '../../application/orders/list-pending-uber-orders.query';
import {
  type UberOrderDetailQueryPort,
  UBER_ORDER_DETAIL_QUERY,
} from '../../application/orders/uber-order-query.ports';
import {
  type UberOrderStatusAuditPort,
  type UberWebhookInboxPort,
  type UberWebhookSignatureVerifier,
  UBER_ORDER_STATUS_AUDIT_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../../application/orders/uber-order-processing.ports';
import {
  type UberOrderSyncRepositoryPort,
  UBER_ORDER_SYNC_REPOSITORY,
} from '../../application/orders/uber-order-sync.ports';
import {
  type UberOrderActionGatewayPort,
  type UberOrderActionRepositoryPort,
  type UberOrderImportRepositoryPort,
  UBER_ORDER_ACTION_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from '../../application/orders/uber-order.ports';
import { UBER_ORDER_IMPORT_PORT } from '../../application/orders/uber-order.ports';
import { UberOrderActionPrismaAdapter } from '../../infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from '../../infrastructure/persistence/uber-order-import-prisma.adapter';
import { UberOrderStatusAuditPrismaAdapter } from '../../infrastructure/persistence/uber-order-status-audit-prisma.adapter';
import { UberOrderSyncPrismaRepository } from '../../infrastructure/persistence/uber-order-sync-prisma.repository';
import { UberOrderActionGatewayAdapter } from '../../infrastructure/uber-api/uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from '../../infrastructure/uber-api/uber-order-detail.gateway';
import { UberOrderGateway } from '../../infrastructure/uber-api/uber-resource.gateways';
import { UberMenuNotificationHandler } from '../../application/menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../../application/merchant/uber-merchant-webhook.handler';
import {
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
} from '../../public-api';
import { presentOrderAction } from '../../contracts/responses/public-contract.mapper';
import {
  type UberStoreMappingRepositoryPort,
  UBER_STORE_MAPPING_REPOSITORY,
} from '../../application/merchant/uber-merchant-persistence.ports';

export function createOrdersWiring(): Provider[] {
  return [
    UberOrderGateway,
    UberOrderDetailGatewayAdapter,
    {
      provide: UBER_ORDER_DETAIL_QUERY,
      useExisting: UberOrderDetailGatewayAdapter,
    },
    UberOrderActionGatewayAdapter,
    {
      provide: UBER_ORDER_ACTION_GATEWAY,
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
      inject: [UBER_ORDER_ACTION_REPOSITORY, UBER_ORDER_ACTION_GATEWAY],
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
      provide: ImportUberOrderUseCase,
      inject: [
        UBER_ORDER_IMPORT_REPOSITORY,
        UBER_ORDER_DETAIL_QUERY,
        UberOrderActionService,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        repository: UberOrderImportRepositoryPort,
        gateway: UberOrderDetailQueryPort,
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
        UBER_ORDER_DETAIL_QUERY,
        UberOrderActionService,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        repository: UberOrderImportRepositoryPort,
        gateway: UberOrderDetailQueryPort,
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
        cancel: async (id: string) =>
          presentOrderAction(await actions.cancel(id)),
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
        UberOrderActionService,
        UberOrderStatusSyncService,
        UBER_TELEMETRY_PORT,
      ],
      useFactory: (
        orders: UberOrderSyncRepositoryPort,
        actions: UberOrderActionService,
        statusSync: UberOrderStatusSyncService,
        telemetry: UberTelemetryPort,
      ) =>
        new SyncUberOrderStatusUseCase(orders, actions, statusSync, telemetry),
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
}
