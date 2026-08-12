import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { UberAuthService } from './infrastructure/uber-api/uber-token.provider';
import { BrowserWriteCsrfGuard } from './api/ubereats-csrf.guard';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { UberHttpClient } from './infrastructure/uber-api/uber-http.client';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { ProcessUberWebhookInboxUseCase } from './application/orders/process-uber-webhook-inbox.use-case';
import { ReplayUnsupportedUberWebhooksUseCase } from './application/orders/replay-unsupported-uber-webhooks.use-case';
import { ReceiveUberWebhookUseCase } from './application/orders/uber-webhook-receiver.use-case';
import { UberMenuDraftAdapter } from './infrastructure/persistence/uber-menu-draft.adapter';
import { UberMenuRepository } from './infrastructure/persistence/uber-menu.repository';
import { PrismaUberMenuUnitOfWork } from './infrastructure/persistence/uber-menu-draft.repositories';
import { UBER_MENU_UNIT_OF_WORK } from './application/ports/uber-menu-repositories.ports';
import { LoadUberMenuWorkflowUseCase } from './application/menu/load-uber-menu-workflow.use-case';
import {
  UberOrderSyncPrismaRepository,
  UberOrderSyncPrismaUnitOfWork,
} from './infrastructure/persistence/uber-order-sync-prisma.repository';
import { UberOrderImportPrismaAdapter } from './infrastructure/persistence/uber-order-import-prisma.adapter';
import { UberOrderDetailGatewayAdapter } from './infrastructure/uber-api/uber-order-detail.gateway';
import { UberOrderActionPrismaAdapter } from './infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderActionGatewayAdapter } from './infrastructure/uber-api/uber-order-action.gateway';
import { UberMenuDraftUseCase } from './application/menu/uber-menu-draft.use-case';
import { UberMenuDraftConfigUseCase } from './application/menu/uber-menu-draft-config.use-case';
import { UberMenuAvailabilityUseCase } from './application/menu/uber-menu-availability.use-case';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from './application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from './application/merchant/uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from './application/merchant/uber-merchant-provisioning.service';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from './application/operations/uber-operations.use-cases';
import { UBER_PERSISTENCE_INTERNAL_PROVIDERS } from './infrastructure/persistence/uber-persistence.providers';
import { UberOrderActionService } from './application/orders/uber-order-action.service';
import { UberOrderOutboxService } from './application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from './application/orders/uber-order-status-sync.service';
import {
  ExecuteUberOrderActionWorker,
  CancelUberOrderUseCase,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './application/orders/uber-order.use-cases';
import { SyncUberOrderStatusUseCase } from './application/orders/sync-uber-order-status.use-case';
import { ListPendingUberOrdersQuery } from './application/orders/list-pending-uber-orders.query';
import { UberCredentialVaultService } from './infrastructure/crypto/uber-credential-vault.service';
import { UberApiGatewayTransport } from './infrastructure/uber-api/uber-api.gateway';
import { ProcessUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter';
import { UBER_RATE_LIMITER_PORT } from './application/ports/uber-rate-limiter.port';
import { createUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter.factory';
import {
  UberMenuGateway,
  UberOrderGateway,
  UberStoreGateway,
  UberMerchantResourceGateway,
} from './infrastructure/uber-api/uber-resource.gateways';
import { UberTelemetryService } from './infrastructure/persistence/uber-telemetry.service';
import { UBER_UNIT_OF_WORK } from './application/ports/uber-persistence.ports';
import {
  UBER_MENU_AVAILABILITY_PORT,
  UBER_MENU_DRAFT_PORT,
  UBER_ORDER_IMPORT_PORT,
} from './application/ports/uber-use-case.ports';
import {
  UBER_ORDER_SYNC_REPOSITORY,
  UBER_ORDER_SYNC_UNIT_OF_WORK,
} from './application/ports/uber-order-sync.ports';
import {
  UBER_MENU_ITEM_OPERATIONS_REPOSITORY,
  UBER_OPERATIONS_UNIT_OF_WORK,
  UBER_OPS_TICKET_REPOSITORY,
  UBER_ORDER_OPERATIONS_REPOSITORY,
  UBER_RECONCILIATION_REPOSITORY,
} from './application/ports/uber-operations.ports';
import {
  UberMenuItemOperationsPrismaRepository,
  UberOperationsPrismaUnitOfWork,
  UberOpsTicketPrismaRepository,
  UberOrderOperationsPrismaRepository,
  UberReconciliationPrismaRepository,
} from './infrastructure/persistence/uber-operations-prisma.repositories';
import {
  UBER_MENU_DRAFT_COMMAND_PORT,
  UBER_MENU_DRAFT_QUERY_PORT,
} from './application/ports/uber-menu-draft.ports';
import {
  UBER_ORDER_ACTION_GATEWAY,
  UBER_ORDER_DETAIL_GATEWAY,
} from './application/ports/uber-api.ports';
import {
  UBER_MERCHANT_API,
  UBER_OAUTH_TOKEN,
  UBER_STORE_API,
} from './application/ports/uber-api.ports';
import {
  UberMerchantApiAdapter,
  UberOAuthTokenAdapter,
} from './infrastructure/uber-api/uber-merchant-api.adapter';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOAuthStatePrismaAdapter,
  UberOperationsAlertPrismaAdapter,
  UberStoreMappingPrismaAdapter,
} from './infrastructure/persistence/uber-merchant-persistence.adapter';
import {
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  UBER_OPERATIONS_ALERT_REPOSITORY,
  UBER_STORE_MAPPING_REPOSITORY,
} from './application/ports/uber-persistence.ports';
import {
  UBER_ORDER_OUTBOX_PORT,
  UBER_ORDER_STATUS_AUDIT_PORT,
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from './application/ports/uber-order-processing.ports';
import {
  UberOrderOutboxPrismaAdapter,
  UberOrderStatusAuditPrismaAdapter,
} from './infrastructure/persistence/uber-order-outbox-prisma.adapter';
import { UberWebhookInboxPrismaAdapter } from './infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { HmacUberWebhookSignatureVerifier } from './infrastructure/crypto/uber-webhook-signature-verifier';
import {
  PrismaUberMenuPublishAdapter,
  PrismaUberOAuthStateAdapter,
  PrismaUberOperationsTicketAdapter,
  PrismaUberOrderActionAdapter,
  PrismaUberUnitOfWork,
  PrismaUberWebhookInboxAdapter,
} from './infrastructure/persistence/uber-prisma.adapters';

import { HandleUberMerchantWebhookHandler } from './application/merchant/uber-merchant-webhook.handler';
import { PublishUberMenuUseCase } from './application/menu/publish-uber-menu.use-case';
import { ConfirmUberMenuPublicationUseCase } from './application/menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from './application/menu/recover-timed-out-menu-publications.use-case';
import {
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from './application/menu/uber-menu-notification.handler';
import { UberMenuNotificationPrismaRepository } from './infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuSnapshotPrismaAdapter } from './infrastructure/persistence/uber-menu-snapshot-prisma.adapter';
import { UberMenuPublicationPrismaAdapter } from './infrastructure/persistence/uber-menu-publication-prisma.adapter';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from './infrastructure/uber-api/uber-menu-publication.adapter';
import { UberImageValidator } from './infrastructure/uber-api/uber-image.validator';
import {
  UBER_MENU_GATEWAY,
  UBER_MENU_IMAGE_PROBE,
  UBER_MENU_PUBLICATION_REPOSITORY,
  UBER_MENU_PUBLISH_COMMAND,
  UBER_MENU_SNAPSHOT_REPOSITORY,
} from './application/ports/uber-menu-publication.ports';
import {
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from './application/ports/uber-order.ports';

export const UBER_EATS_INTERNAL_PROVIDERS = [
  {
    provide: UberConfigService,
    useFactory: () => new UberConfigService(process.env),
  },
  BrowserWriteCsrfGuard,
  {
    provide: UberCredentialVaultService,
    useFactory: () => new UberCredentialVaultService(process.env),
  },
  ...UBER_PERSISTENCE_INTERNAL_PROVIDERS,
  PrismaUberWebhookInboxAdapter,
  PrismaUberOrderActionAdapter,
  PrismaUberOAuthStateAdapter,
  PrismaUberMenuPublishAdapter,
  PrismaUberOperationsTicketAdapter,
  PrismaUberUnitOfWork,
  { provide: UBER_UNIT_OF_WORK, useExisting: PrismaUberUnitOfWork },
  UberTelemetryService,
  { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
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
  UberWebhookInboxPrismaAdapter,
  {
    provide: UBER_WEBHOOK_INBOX_PORT,
    useExisting: UberWebhookInboxPrismaAdapter,
  },
  HmacUberWebhookSignatureVerifier,
  {
    provide: UBER_WEBHOOK_SIGNATURE_VERIFIER,
    useExisting: HmacUberWebhookSignatureVerifier,
  },
  UberAuthService,
  UberHttpClient,
  {
    provide: UBER_RATE_LIMITER_PORT,
    inject: [UberConfigService, UberTelemetryService],
    useFactory: (config: UberConfigService, metrics: UberTelemetryService) =>
      createUberRateLimiter(process.env, config, metrics),
  },
  UberApiGatewayTransport,
  UberMerchantResourceGateway,
  UberStoreGateway,
  UberOrderGateway,
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
  { provide: UBER_ORDER_ACTION_GATEWAY, useExisting: UberOrderGateway },
  UberMenuGateway,
  UberImageValidator,
  UberMenuSnapshotPrismaAdapter,
  {
    provide: UBER_MENU_SNAPSHOT_REPOSITORY,
    useExisting: UberMenuSnapshotPrismaAdapter,
  },
  UberMenuPublicationPrismaAdapter,
  {
    provide: UBER_MENU_PUBLICATION_REPOSITORY,
    useExisting: UberMenuPublicationPrismaAdapter,
  },
  UberMenuGatewayAdapter,
  { provide: UBER_MENU_GATEWAY, useExisting: UberMenuGatewayAdapter },
  UberMenuImageProbeAdapter,
  { provide: UBER_MENU_IMAGE_PROBE, useExisting: UberMenuImageProbeAdapter },
  {
    provide: ReceiveUberWebhookUseCase,
    inject: [
      UBER_WEBHOOK_INBOX_PORT,
      UBER_WEBHOOK_SIGNATURE_VERIFIER,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      inbox: UberWebhookInboxPrismaAdapter,
      signatures: HmacUberWebhookSignatureVerifier,
      telemetry: UberTelemetryService,
    ) => new ReceiveUberWebhookUseCase(inbox, signatures, telemetry),
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
      inbox: UberWebhookInboxPrismaAdapter,
      orders: ImportUberOrderUseCase,
      menu: UberMenuNotificationHandler,
      merchant: HandleUberMerchantWebhookHandler,
      telemetry: UberTelemetryService,
    ) =>
      new ProcessUberWebhookInboxUseCase(
        inbox,
        orders,
        menu,
        merchant,
        telemetry,
      ),
  },
  {
    provide: ReplayUnsupportedUberWebhooksUseCase,
    inject: [UBER_WEBHOOK_INBOX_PORT],
    useFactory: (inbox: UberWebhookInboxPrismaAdapter) =>
      new ReplayUnsupportedUberWebhooksUseCase(inbox),
  },
  {
    provide: HandleUberMerchantWebhookHandler,
    inject: [UBER_WEBHOOK_INBOX_PORT, UBER_TELEMETRY_PORT],
    useFactory: (
      inbox: UberWebhookInboxPrismaAdapter,
      telemetry: UberTelemetryService,
    ) => new HandleUberMerchantWebhookHandler(inbox, telemetry),
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
  UberOrderImportPrismaAdapter,
  {
    provide: UBER_ORDER_IMPORT_REPOSITORY,
    useExisting: UberOrderImportPrismaAdapter,
  },
  {
    provide: UberOrderActionService,
    inject: [UBER_ORDER_ACTION_REPOSITORY, UBER_ORDER_ACTION_COMMAND_GATEWAY],
    useFactory: (
      repository: UberOrderActionPrismaAdapter,
      gateway: UberOrderActionGatewayAdapter,
    ) => new UberOrderActionService(repository, gateway),
  },
  {
    provide: UberOrderStatusSyncService,
    inject: [UBER_ORDER_STATUS_AUDIT_PORT],
    useFactory: (audit: UberOrderStatusAuditPrismaAdapter) =>
      new UberOrderStatusSyncService(audit),
  },
  {
    provide: UberOrderOutboxService,
    inject: [UBER_ORDER_OUTBOX_PORT],
    useFactory: (outbox: UberOrderOutboxPrismaAdapter) =>
      new UberOrderOutboxService(outbox),
  },
  {
    provide: ImportUberOrderUseCase,
    inject: [
      UBER_ORDER_IMPORT_REPOSITORY,
      UBER_ORDER_DETAIL_GATEWAY,
      UberOrderActionService,
    ],
    useFactory: (
      repository: UberOrderImportPrismaAdapter,
      gateway: UberOrderDetailGatewayAdapter,
      actions: UberOrderActionService,
    ) => new ImportUberOrderUseCase(repository, gateway, actions),
  },
  { provide: UBER_ORDER_IMPORT_PORT, useExisting: ImportUberOrderUseCase },
  {
    provide: CancelUberOrderUseCase,
    inject: [
      UBER_ORDER_IMPORT_REPOSITORY,
      UBER_ORDER_DETAIL_GATEWAY,
      UberOrderActionService,
    ],
    useFactory: (
      repository: UberOrderImportPrismaAdapter,
      gateway: UberOrderDetailGatewayAdapter,
      actions: UberOrderActionService,
    ) => new CancelUberOrderUseCase(repository, gateway, actions),
  },
  {
    provide: RequestUberOrderActionUseCase,
    inject: [UberOrderActionService],
    useFactory: (actions: UberOrderActionService) =>
      new RequestUberOrderActionUseCase(actions),
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
      orders: UberOrderSyncPrismaRepository,
      unitOfWork: UberOrderSyncPrismaUnitOfWork,
      queue: UberOrderOutboxPrismaAdapter,
      statusSync: UberOrderStatusSyncService,
      telemetry: UberTelemetryService,
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
    provide: ListPendingUberOrdersQuery,
    inject: [UBER_ORDER_SYNC_REPOSITORY],
    useFactory: (orders: UberOrderSyncPrismaRepository) =>
      new ListPendingUberOrdersQuery(orders),
  },
  UberMenuDraftAdapter,
  { provide: UBER_MENU_DRAFT_PORT, useExisting: UberMenuDraftAdapter },
  {
    provide: UBER_MENU_AVAILABILITY_PORT,
    useExisting: UberMenuDraftAdapter,
  },
  {
    provide: UberMenuDraftUseCase,
    inject: [UBER_MENU_DRAFT_PORT],
    useFactory: (drafts: UberMenuDraftAdapter) =>
      new UberMenuDraftUseCase(drafts),
  },
  UberMenuRepository,
  PrismaUberMenuUnitOfWork,
  { provide: UBER_MENU_UNIT_OF_WORK, useExisting: PrismaUberMenuUnitOfWork },
  {
    provide: LoadUberMenuWorkflowUseCase,
    inject: [UBER_MENU_UNIT_OF_WORK],
    useFactory: (unitOfWork: PrismaUberMenuUnitOfWork) =>
      new LoadUberMenuWorkflowUseCase(unitOfWork),
  },
  {
    provide: UBER_MENU_DRAFT_QUERY_PORT,
    useExisting: UberMenuRepository,
  },
  {
    provide: UBER_MENU_DRAFT_COMMAND_PORT,
    useExisting: UberMenuRepository,
  },
  {
    provide: UberMenuDraftConfigUseCase,
    inject: [UBER_MENU_DRAFT_QUERY_PORT, UBER_MENU_DRAFT_COMMAND_PORT],
    useFactory: (queries: UberMenuRepository, commands: UberMenuRepository) =>
      new UberMenuDraftConfigUseCase(queries, commands),
  },
  {
    provide: PublishUberMenuUseCase,
    inject: [
      UBER_MENU_SNAPSHOT_REPOSITORY,
      UBER_MENU_PUBLICATION_REPOSITORY,
      UBER_MENU_GATEWAY,
      UBER_MENU_IMAGE_PROBE,
    ],
    useFactory: (
      snapshots: UberMenuSnapshotPrismaAdapter,
      publications: UberMenuPublicationPrismaAdapter,
      gateway: UberMenuGatewayAdapter,
      images: UberMenuImageProbeAdapter,
    ) => new PublishUberMenuUseCase(snapshots, publications, gateway, images),
  },
  { provide: UBER_MENU_PUBLISH_COMMAND, useExisting: PublishUberMenuUseCase },
  {
    provide: ConfirmUberMenuPublicationUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY, UBER_MENU_GATEWAY],
    useFactory: (
      publications: UberMenuPublicationPrismaAdapter,
      gateway: UberMenuGatewayAdapter,
    ) => new ConfirmUberMenuPublicationUseCase(publications, gateway),
  },
  {
    provide: RecoverTimedOutMenuPublicationsUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY],
    useFactory: (publications: UberMenuPublicationPrismaAdapter) =>
      new RecoverTimedOutMenuPublicationsUseCase(publications),
  },
  {
    provide: UberMenuNotificationHandler,
    inject: [MENU_NOTIFICATION_REPOSITORY],
    useFactory: (repository: UberMenuNotificationPrismaRepository) =>
      new UberMenuNotificationHandler(repository),
  },
  UberMenuNotificationPrismaRepository,
  {
    provide: MENU_NOTIFICATION_REPOSITORY,
    useExisting: UberMenuNotificationPrismaRepository,
  },
  {
    provide: UberMenuAvailabilityUseCase,
    inject: [UBER_MENU_AVAILABILITY_PORT],
    useFactory: (availability: UberMenuDraftAdapter) =>
      new UberMenuAvailabilityUseCase(availability),
  },
  UberOAuthTokenAdapter,
  { provide: UBER_OAUTH_TOKEN, useExisting: UberOAuthTokenAdapter },
  UberMerchantApiAdapter,
  { provide: UBER_MERCHANT_API, useExisting: UberMerchantApiAdapter },
  { provide: UBER_STORE_API, useExisting: UberMerchantApiAdapter },
  UberOAuthStatePrismaAdapter,
  {
    provide: UBER_OAUTH_STATE_REPOSITORY,
    useExisting: UberOAuthStatePrismaAdapter,
  },
  UberMerchantConnectionPrismaAdapter,
  {
    provide: UBER_MERCHANT_CONNECTION_REPOSITORY,
    useExisting: UberMerchantConnectionPrismaAdapter,
  },
  UberStoreMappingPrismaAdapter,
  {
    provide: UBER_STORE_MAPPING_REPOSITORY,
    useExisting: UberStoreMappingPrismaAdapter,
  },
  UberOperationsAlertPrismaAdapter,
  {
    provide: UBER_OPERATIONS_ALERT_REPOSITORY,
    useExisting: UberOperationsAlertPrismaAdapter,
  },
  {
    provide: StartUberOAuthUseCase,
    inject: [UBER_OAUTH_TOKEN, UBER_OAUTH_STATE_REPOSITORY],
    useFactory: (
      tokens: UberOAuthTokenAdapter,
      states: UberOAuthStatePrismaAdapter,
    ) => new StartUberOAuthUseCase(tokens, states),
  },
  {
    provide: CompleteUberOAuthUseCase,
    inject: [
      UBER_OAUTH_TOKEN,
      UBER_OAUTH_STATE_REPOSITORY,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
    ],
    useFactory: (
      tokens: UberOAuthTokenAdapter,
      states: UberOAuthStatePrismaAdapter,
      connections: UberMerchantConnectionPrismaAdapter,
    ) => new CompleteUberOAuthUseCase(tokens, states, connections),
  },
  {
    provide: DiscoverUberStoresUseCase,
    inject: [
      UBER_MERCHANT_API,
      UBER_OAUTH_TOKEN,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      api: UberMerchantApiAdapter,
      tokens: UberOAuthTokenAdapter,
      connections: UberMerchantConnectionPrismaAdapter,
      mappings: UberStoreMappingPrismaAdapter,
    ) => new DiscoverUberStoresUseCase(api, tokens, connections, mappings),
  },
  {
    provide: MapUberStoreUseCase,
    inject: [UBER_STORE_MAPPING_REPOSITORY],
    useFactory: (mappings: UberStoreMappingPrismaAdapter) =>
      new MapUberStoreUseCase(mappings),
  },
  {
    provide: ProvisionUberStoreUseCase,
    inject: [
      UBER_STORE_API,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      api: UberMerchantApiAdapter,
      connections: UberMerchantConnectionPrismaAdapter,
      mappings: UberStoreMappingPrismaAdapter,
    ) => new ProvisionUberStoreUseCase(api, connections, mappings),
  },
  {
    provide: DeprovisionUberStoreUseCase,
    useFactory: () => new DeprovisionUberStoreUseCase(),
  },
  {
    provide: SyncUberStoreStatusUseCase,
    inject: [
      UBER_STORE_API,
      UBER_STORE_MAPPING_REPOSITORY,
      UBER_OPERATIONS_ALERT_REPOSITORY,
    ],
    useFactory: (
      api: UberMerchantApiAdapter,
      mappings: UberStoreMappingPrismaAdapter,
      alerts: UberOperationsAlertPrismaAdapter,
    ) => new SyncUberStoreStatusUseCase(api, mappings, alerts),
  },
  UberOrderOperationsPrismaRepository,
  {
    provide: UBER_ORDER_OPERATIONS_REPOSITORY,
    useExisting: UberOrderOperationsPrismaRepository,
  },
  UberMenuItemOperationsPrismaRepository,
  {
    provide: UBER_MENU_ITEM_OPERATIONS_REPOSITORY,
    useExisting: UberMenuItemOperationsPrismaRepository,
  },
  UberReconciliationPrismaRepository,
  {
    provide: UBER_RECONCILIATION_REPOSITORY,
    useExisting: UberReconciliationPrismaRepository,
  },
  UberOpsTicketPrismaRepository,
  {
    provide: UBER_OPS_TICKET_REPOSITORY,
    useExisting: UberOpsTicketPrismaRepository,
  },
  UberOperationsPrismaUnitOfWork,
  {
    provide: UBER_OPERATIONS_UNIT_OF_WORK,
    useExisting: UberOperationsPrismaUnitOfWork,
  },
  {
    provide: GenerateUberReconciliationReportUseCase,
    inject: [
      UBER_ORDER_OPERATIONS_REPOSITORY,
      UBER_RECONCILIATION_REPOSITORY,
      UBER_OPS_TICKET_REPOSITORY,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      orders: UberOrderOperationsPrismaRepository,
      reports: UberReconciliationPrismaRepository,
      tickets: UberOpsTicketPrismaRepository,
      telemetry: UberTelemetryService,
    ) =>
      new GenerateUberReconciliationReportUseCase(
        orders,
        reports,
        tickets,
        telemetry,
      ),
  },
  {
    provide: CreateUberOpsTicketUseCase,
    inject: [
      UBER_OPS_TICKET_REPOSITORY,
      UBER_ORDER_OPERATIONS_REPOSITORY,
      UBER_MENU_ITEM_OPERATIONS_REPOSITORY,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      tickets: UberOpsTicketPrismaRepository,
      orders: UberOrderOperationsPrismaRepository,
      menuItems: UberMenuItemOperationsPrismaRepository,
      telemetry: UberTelemetryService,
    ) => new CreateUberOpsTicketUseCase(tickets, orders, menuItems, telemetry),
  },
  {
    provide: RetryUberOpsTicketUseCase,
    inject: [
      UBER_OPERATIONS_UNIT_OF_WORK,
      SyncUberOrderStatusUseCase,
      PublishUberMenuUseCase,
      UberMenuAvailabilityUseCase,
      SyncUberStoreStatusUseCase,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      unitOfWork: UberOperationsPrismaUnitOfWork,
      orders: SyncUberOrderStatusUseCase,
      publish: PublishUberMenuUseCase,
      availability: UberMenuAvailabilityUseCase,
      stores: SyncUberStoreStatusUseCase,
      telemetry: UberTelemetryService,
    ) =>
      new RetryUberOpsTicketUseCase(
        unitOfWork,
        orders,
        publish,
        availability,
        stores,
        telemetry,
      ),
  },
  {
    provide: QueryUberOperationsSummary,
    inject: [UBER_RECONCILIATION_REPOSITORY, UBER_OPS_TICKET_REPOSITORY],
    useFactory: (
      reports: UberReconciliationPrismaRepository,
      tickets: UberOpsTicketPrismaRepository,
    ) => new QueryUberOperationsSummary(reports, tickets),
  },
];

export const UBER_EATS_PUBLIC_PROVIDERS = [
  UberAuthService,
  BrowserWriteCsrfGuard,
  ReceiveUberWebhookUseCase,
  RequestUberOrderActionUseCase,
  SyncUberOrderStatusUseCase,
  ListPendingUberOrdersQuery,
  UberMenuDraftUseCase,
  UberMenuDraftConfigUseCase,
  PublishUberMenuUseCase,
  UberMenuAvailabilityUseCase,
  StartUberOAuthUseCase,
  CompleteUberOAuthUseCase,
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  ProvisionUberStoreUseCase,
  DeprovisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  GenerateUberReconciliationReportUseCase,
  CreateUberOpsTicketUseCase,
  RetryUberOpsTicketUseCase,
  QueryUberOperationsSummary,
];

@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  providers: UBER_EATS_INTERNAL_PROVIDERS,
  exports: UBER_EATS_PUBLIC_PROVIDERS,
})
export class UberEatsApplicationModule {}
