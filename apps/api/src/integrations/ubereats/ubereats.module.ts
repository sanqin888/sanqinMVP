import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { BrowserWriteCsrfGuard } from './api/ubereats-csrf.guard';
import { UBER_RATE_LIMITER_PORT } from './application/ports/uber-rate-limiter.port';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
  type UberTelemetryPort,
  type UberWebhookInboxPort,
  type UberOrderOutboxPort,
  type UberOrderStatusAuditPort,
  type UberWebhookSignatureVerifier,
  UBER_ORDER_OUTBOX_PORT,
  UBER_ORDER_STATUS_AUDIT_PORT,
} from './application/ports/uber-order-processing.ports';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { UberCredentialVaultService } from './infrastructure/crypto/uber-credential-vault.service';
import { HmacUberWebhookSignatureVerifier } from './infrastructure/crypto/uber-webhook-signature-verifier';
import { UberTelemetryService } from './infrastructure/persistence/uber-telemetry.service';
import { UberWebhookInboxPrismaAdapter } from './infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { UberApiGatewayTransport } from './infrastructure/uber-api/uber-api.gateway';
import { UberHttpClient } from './infrastructure/uber-api/uber-http.client';
import { createUberRateLimiter } from './infrastructure/uber-api/uber-rate-limiter.factory';
import { UberAuthService } from './infrastructure/uber-api/uber-token.provider';
import {
  UBER_EATS_STORE_STATUS_SYNC,
  UBER_EATS_MENU_AVAILABILITY,
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
} from './public-api';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from './application/merchant/uber-merchant-oauth.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from './application/merchant/uber-merchant-provisioning.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from './application/merchant/uber-merchant-store-mapping.service';
import { HandleUberMerchantWebhookHandler } from './application/merchant/uber-merchant-webhook.handler';
import {
  type UberMerchantApiPort,
  type UberOAuthTokenPort,
  type UberStoreApiPort,
  UBER_MERCHANT_API,
  UBER_OAUTH_TOKEN,
  UBER_STORE_API,
  type UberOrderDetailGatewayPort,
  UBER_ORDER_ACTION_GATEWAY,
  UBER_ORDER_DETAIL_GATEWAY,
} from './application/ports/uber-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberOAuthStatePort,
  type UberOperationsAlertRepositoryPort,
  type UberStoreMappingRepositoryPort,
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  UBER_OPERATIONS_ALERT_REPOSITORY,
  UBER_STORE_MAPPING_REPOSITORY,
} from './application/ports/uber-persistence.ports';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOAuthStatePrismaAdapter,
  UberOperationsAlertPrismaAdapter,
  UberStoreMappingPrismaAdapter,
} from './infrastructure/persistence/uber-merchant-persistence.adapter';
import {
  UberMerchantApiAdapter,
  UberOAuthTokenAdapter,
} from './infrastructure/uber-api/uber-merchant-api.adapter';
import {
  UberMerchantResourceGateway,
  UberStoreGateway,
  UberMenuGateway,
  UberOrderGateway,
} from './infrastructure/uber-api/uber-resource.gateways';
import { LoadUberMenuWorkflowUseCase } from './application/menu/load-uber-menu-workflow.use-case';
import { UberMenuDraftUseCase } from './application/menu/uber-menu-draft.use-case';
import { UberMenuAvailabilityUseCase } from './application/menu/uber-menu-availability.use-case';
import { PublishUberMenuUseCase } from './application/menu/publish-uber-menu.use-case';
import { ConfirmUberMenuPublicationUseCase } from './application/menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from './application/menu/recover-timed-out-menu-publications.use-case';
import {
  type MenuNotificationRepository,
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from './application/menu/uber-menu-notification.handler';
import {
  type UberMenuConfigQueryPort,
  type UberMenuConfigWritePort,
  type UberMenuDraftDiffPort,
  type UberMenuDraftMutationPort,
  type UberMenuDraftReadPort,
  type UberMenuReferenceQueryPort,
  UBER_MENU_CONFIG_QUERY_PORT,
  UBER_MENU_CONFIG_WRITE_PORT,
  UBER_MENU_REFERENCE_QUERY_PORT,
  UBER_MENU_DRAFT_DIFF_PORT,
  UBER_MENU_DRAFT_MUTATION_PORT,
  UBER_MENU_DRAFT_READ_PORT,
} from './application/ports/uber-menu-draft.ports';
import {
  type UberMenuGatewayPort,
  type UberMenuImageProbePort,
  type UberMenuPublishCommandPort,
  type UberMenuPublicationRepositoryPort,
  type UberMenuSnapshotRepositoryPort,
  UBER_MENU_GATEWAY,
  UBER_MENU_IMAGE_PROBE,
  UBER_MENU_PUBLICATION_REPOSITORY,
  UBER_MENU_PUBLISH_COMMAND,
  UBER_MENU_SNAPSHOT_REPOSITORY,
} from './application/ports/uber-menu-publication.ports';
import {
  UBER_MENU_UNIT_OF_WORK,
  type UberMenuUnitOfWork,
} from './application/ports/uber-menu-repositories.ports';
import {
  UBER_MENU_AVAILABILITY_PORT,
  UBER_ORDER_IMPORT_PORT,
} from './application/ports/uber-use-case.ports';
import {
  type UberMenuAvailabilityCommandPort,
  type UberMenuAvailabilityQueryPort,
  UBER_MENU_AVAILABILITY_COMMAND,
  UBER_MENU_AVAILABILITY_QUERY,
} from './application/ports/uber-menu-availability.ports';
import { UberMenuAvailabilityPrismaAdapter } from './infrastructure/persistence/uber-menu-availability-prisma.adapter';
import { PrismaUberMenuUnitOfWork } from './infrastructure/persistence/uber-menu-draft.repositories';
import { UberMenuNotificationPrismaRepository } from './infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuPublicationPrismaAdapter } from './infrastructure/persistence/uber-menu-publication-prisma.adapter';
import { UberMenuSnapshotPrismaAdapter } from './infrastructure/persistence/uber-menu-snapshot-prisma.adapter';
import { UberMenuConfigQueryPrismaAdapter } from './infrastructure/persistence/uber-menu-config-query-prisma.adapter';
import { UberMenuConfigWritePrismaAdapter } from './infrastructure/persistence/uber-menu-config-write-prisma.adapter';
import { UberMenuDraftReadPrismaAdapter } from './infrastructure/persistence/uber-menu-draft-read-prisma.adapter';
import { UberMenuDraftMutationPrismaAdapter } from './infrastructure/persistence/uber-menu-draft-mutation-prisma.adapter';
import { UberMenuDraftDiffPrismaAdapter } from './infrastructure/persistence/uber-menu-draft-diff-prisma.adapter';
import { UberMenuReferenceQueryPrismaAdapter } from './infrastructure/persistence/uber-menu-reference-query-prisma.adapter';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from './infrastructure/uber-api/uber-menu-publication.adapter';
import { UberImageValidator } from './infrastructure/uber-api/uber-image.validator';
import { ReceiveUberWebhookUseCase } from './application/orders/uber-webhook-receiver.use-case';
import { ProcessUberWebhookInboxUseCase } from './application/orders/process-uber-webhook-inbox.use-case';
import { ReplayUnsupportedUberWebhooksUseCase } from './application/orders/replay-unsupported-uber-webhooks.use-case';
import { UberOrderActionService } from './application/orders/uber-order-action.service';
import { UberOrderOutboxService } from './application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from './application/orders/uber-order-status-sync.service';
import {
  CancelUberOrderUseCase,
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './application/orders/uber-order.use-cases';
import { SyncUberOrderStatusUseCase } from './application/orders/sync-uber-order-status.use-case';
import { ListPendingUberOrdersQuery } from './application/orders/list-pending-uber-orders.query';
import {
  type UberOrderActionQueuePort,
  type UberOrderSyncRepositoryPort,
  type UberOrderSyncUnitOfWorkPort,
  UBER_ORDER_SYNC_REPOSITORY,
  UBER_ORDER_SYNC_UNIT_OF_WORK,
} from './application/ports/uber-order-sync.ports';
import {
  type UberOrderActionGatewayPort,
  type UberOrderActionRepositoryPort,
  type UberOrderImportRepositoryPort,
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from './application/ports/uber-order.ports';
import { UberOrderActionPrismaAdapter } from './infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from './infrastructure/persistence/uber-order-import-prisma.adapter';
import {
  UberOrderOutboxPrismaAdapter,
  UberOrderStatusAuditPrismaAdapter,
} from './infrastructure/persistence/uber-order-outbox-prisma.adapter';
import {
  UberOrderSyncPrismaRepository,
  UberOrderSyncPrismaUnitOfWork,
} from './infrastructure/persistence/uber-order-sync-prisma.repository';
import { UberOrderActionGatewayAdapter } from './infrastructure/uber-api/uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from './infrastructure/uber-api/uber-order-detail.gateway';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from './application/operations/uber-operations.use-cases';
import {
  type UberMenuItemOperationsRepositoryPort,
  type UberOperationsUnitOfWorkPort,
  type UberOpsTicketRepositoryPort,
  type UberOrderOperationsRepositoryPort,
  type UberReconciliationRepositoryPort,
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
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';

const INTERNAL_INFRASTRUCTURE_PROVIDERS = [
  {
    provide: UberConfigService,
    useFactory: () => new UberConfigService(process.env),
  },
  BrowserWriteCsrfGuard,
  {
    provide: UberCredentialVaultService,
    useFactory: () => new UberCredentialVaultService(process.env),
  },
  UberTelemetryService,
  { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
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
  UberHttpClient,
  {
    provide: UBER_RATE_LIMITER_PORT,
    inject: [UberConfigService, UberTelemetryService],
    useFactory: (config: UberConfigService, telemetry: UberTelemetryService) =>
      createUberRateLimiter(process.env, config, telemetry),
  },
  UberAuthService,
  UberApiGatewayTransport,
];

const UBER_EATS_MERCHANT_PROVIDERS = [
  UberMerchantResourceGateway,
  UberStoreGateway,
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
    useFactory: (tokens: UberOAuthTokenPort, states: UberOAuthStatePort) =>
      new StartUberOAuthUseCase(tokens, states),
  },
  {
    provide: CompleteUberOAuthUseCase,
    inject: [
      UBER_OAUTH_TOKEN,
      UBER_OAUTH_STATE_REPOSITORY,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
    ],
    useFactory: (
      tokens: UberOAuthTokenPort,
      states: UberOAuthStatePort,
      connections: UberMerchantConnectionRepositoryPort,
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
      api: UberMerchantApiPort,
      tokens: UberOAuthTokenPort,
      connections: UberMerchantConnectionRepositoryPort,
      mappings: UberStoreMappingRepositoryPort,
    ) => new DiscoverUberStoresUseCase(api, tokens, connections, mappings),
  },
  {
    provide: MapUberStoreUseCase,
    inject: [UBER_STORE_MAPPING_REPOSITORY],
    useFactory: (mappings: UberStoreMappingRepositoryPort) =>
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
      api: UberStoreApiPort,
      connections: UberMerchantConnectionRepositoryPort,
      mappings: UberStoreMappingRepositoryPort,
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
      api: UberStoreApiPort,
      mappings: UberStoreMappingRepositoryPort,
      alerts: UberOperationsAlertRepositoryPort,
    ) => new SyncUberStoreStatusUseCase(api, mappings, alerts),
  },
  {
    provide: UBER_EATS_STORE_STATUS_SYNC,
    useExisting: SyncUberStoreStatusUseCase,
  },
  {
    provide: HandleUberMerchantWebhookHandler,
    inject: [UBER_WEBHOOK_INBOX_PORT, UBER_TELEMETRY_PORT],
    useFactory: (inbox: UberWebhookInboxPort, telemetry: UberTelemetryPort) =>
      new HandleUberMerchantWebhookHandler(inbox, telemetry),
  },
];

const UBER_EATS_MERCHANT_EXPORTS = [
  StartUberOAuthUseCase,
  CompleteUberOAuthUseCase,
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  ProvisionUberStoreUseCase,
  DeprovisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  UBER_EATS_STORE_STATUS_SYNC,
  HandleUberMerchantWebhookHandler,
];

const UBER_EATS_MENU_PROVIDERS = [
  UberMenuGateway,
  UberImageValidator,
  UberMenuConfigQueryPrismaAdapter,
  UberMenuConfigWritePrismaAdapter,
  UberMenuDraftReadPrismaAdapter,
  UberMenuDraftMutationPrismaAdapter,
  UberMenuDraftDiffPrismaAdapter,
  UberMenuReferenceQueryPrismaAdapter,
  {
    provide: UBER_MENU_CONFIG_QUERY_PORT,
    useExisting: UberMenuConfigQueryPrismaAdapter,
  },
  {
    provide: UBER_MENU_CONFIG_WRITE_PORT,
    useExisting: UberMenuConfigWritePrismaAdapter,
  },
  {
    provide: UBER_MENU_DRAFT_READ_PORT,
    useExisting: UberMenuDraftReadPrismaAdapter,
  },
  {
    provide: UBER_MENU_DRAFT_MUTATION_PORT,
    useExisting: UberMenuDraftMutationPrismaAdapter,
  },
  {
    provide: UBER_MENU_DRAFT_DIFF_PORT,
    useExisting: UberMenuDraftDiffPrismaAdapter,
  },
  {
    provide: UBER_MENU_REFERENCE_QUERY_PORT,
    useExisting: UberMenuReferenceQueryPrismaAdapter,
  },
  UberMenuAvailabilityPrismaAdapter,
  {
    provide: UBER_MENU_AVAILABILITY_QUERY,
    useExisting: UberMenuAvailabilityPrismaAdapter,
  },
  {
    provide: UBER_MENU_AVAILABILITY_COMMAND,
    useExisting: UberMenuAvailabilityPrismaAdapter,
  },
  PrismaUberMenuUnitOfWork,
  { provide: UBER_MENU_UNIT_OF_WORK, useExisting: PrismaUberMenuUnitOfWork },
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
  UberMenuNotificationPrismaRepository,
  {
    provide: MENU_NOTIFICATION_REPOSITORY,
    useExisting: UberMenuNotificationPrismaRepository,
  },
  {
    provide: UberMenuDraftUseCase,
    inject: [
      UBER_MENU_CONFIG_QUERY_PORT,
      UBER_MENU_CONFIG_WRITE_PORT,
      UBER_MENU_DRAFT_READ_PORT,
      UBER_MENU_DRAFT_MUTATION_PORT,
      UBER_MENU_DRAFT_DIFF_PORT,
      UBER_MENU_REFERENCE_QUERY_PORT,
    ],
    useFactory: (
      configQueries: UberMenuConfigQueryPort,
      configWrites: UberMenuConfigWritePort,
      draftQueries: UberMenuDraftReadPort,
      draftMutations: UberMenuDraftMutationPort,
      draftDiffs: UberMenuDraftDiffPort,
      references: UberMenuReferenceQueryPort,
    ) =>
      new UberMenuDraftUseCase(
        configQueries,
        configWrites,
        draftQueries,
        draftMutations,
        draftDiffs,
        references,
      ),
  },
  {
    provide: LoadUberMenuWorkflowUseCase,
    inject: [UBER_MENU_UNIT_OF_WORK],
    useFactory: (unitOfWork: UberMenuUnitOfWork) =>
      new LoadUberMenuWorkflowUseCase(unitOfWork),
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
      snapshots: UberMenuSnapshotRepositoryPort,
      publications: UberMenuPublicationRepositoryPort,
      gateway: UberMenuGatewayPort,
      images: UberMenuImageProbePort,
    ) => new PublishUberMenuUseCase(snapshots, publications, gateway, images),
  },
  { provide: UBER_MENU_PUBLISH_COMMAND, useExisting: PublishUberMenuUseCase },
  {
    provide: ConfirmUberMenuPublicationUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY, UBER_MENU_GATEWAY],
    useFactory: (
      publications: UberMenuPublicationRepositoryPort,
      gateway: UberMenuGatewayPort,
    ) => new ConfirmUberMenuPublicationUseCase(publications, gateway),
  },
  {
    provide: RecoverTimedOutMenuPublicationsUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY],
    useFactory: (publications: UberMenuPublicationRepositoryPort) =>
      new RecoverTimedOutMenuPublicationsUseCase(publications),
  },
  {
    provide: UberMenuNotificationHandler,
    inject: [MENU_NOTIFICATION_REPOSITORY],
    useFactory: (repository: MenuNotificationRepository) =>
      new UberMenuNotificationHandler(repository),
  },
  {
    provide: UberMenuAvailabilityUseCase,
    inject: [
      UBER_MENU_AVAILABILITY_QUERY,
      UBER_MENU_AVAILABILITY_COMMAND,
      UBER_MENU_PUBLISH_COMMAND,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      queries: UberMenuAvailabilityQueryPort,
      commands: UberMenuAvailabilityCommandPort,
      publish: UberMenuPublishCommandPort,
      telemetry: UberTelemetryPort,
    ) => new UberMenuAvailabilityUseCase(queries, commands, publish, telemetry),
  },
  {
    provide: UBER_MENU_AVAILABILITY_PORT,
    useExisting: UberMenuAvailabilityUseCase,
  },
  {
    provide: UBER_EATS_MENU_AVAILABILITY,
    useExisting: UberMenuAvailabilityUseCase,
  },
];

const UBER_EATS_MENU_EXPORTS = [
  UberMenuDraftUseCase,
  PublishUberMenuUseCase,
  ConfirmUberMenuPublicationUseCase,
  RecoverTimedOutMenuPublicationsUseCase,
  UberMenuNotificationHandler,
  UberMenuAvailabilityUseCase,
  UBER_EATS_MENU_AVAILABILITY,
];

const UBER_EATS_ORDER_PROVIDERS = [
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
    ],
    useFactory: (
      repository: UberOrderImportRepositoryPort,
      gateway: UberOrderDetailGatewayPort,
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
      repository: UberOrderImportRepositoryPort,
      gateway: UberOrderDetailGatewayPort,
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
    provide: UBER_EATS_ORDER_ACTIONS,
    useExisting: RequestUberOrderActionUseCase,
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

const UBER_EATS_ORDER_EXPORTS = [
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

const UBER_EATS_OPERATIONS_PROVIDERS = [
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
      orders: UberOrderOperationsRepositoryPort,
      reports: UberReconciliationRepositoryPort,
      tickets: UberOpsTicketRepositoryPort,
      telemetry: UberTelemetryPort,
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
      tickets: UberOpsTicketRepositoryPort,
      orders: UberOrderOperationsRepositoryPort,
      menuItems: UberMenuItemOperationsRepositoryPort,
      telemetry: UberTelemetryPort,
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
      unitOfWork: UberOperationsUnitOfWorkPort,
      orders: SyncUberOrderStatusUseCase,
      publish: PublishUberMenuUseCase,
      availability: UberMenuAvailabilityUseCase,
      stores: SyncUberStoreStatusUseCase,
      telemetry: UberTelemetryPort,
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
      reports: UberReconciliationRepositoryPort,
      tickets: UberOpsTicketRepositoryPort,
    ) => new QueryUberOperationsSummary(reports, tickets),
  },
];

const UBER_EATS_OPERATIONS_EXPORTS = [
  GenerateUberReconciliationReportUseCase,
  CreateUberOpsTicketUseCase,
  RetryUberOpsTicketUseCase,
  QueryUberOperationsSummary,
];

/** HTTP composition root. Worker composition lives in infrastructure/workers. */
@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
  providers: [
    ...INTERNAL_INFRASTRUCTURE_PROVIDERS,
    ...UBER_EATS_MERCHANT_PROVIDERS,
    ...UBER_EATS_MENU_PROVIDERS,
    ...UBER_EATS_ORDER_PROVIDERS,
    ...UBER_EATS_OPERATIONS_PROVIDERS,
  ],
  exports: [
    ...UBER_EATS_MERCHANT_EXPORTS,
    ...UBER_EATS_MENU_EXPORTS,
    ...UBER_EATS_ORDER_EXPORTS,
    ...UBER_EATS_OPERATIONS_EXPORTS,
  ],
})
export class UberEatsModule {}
