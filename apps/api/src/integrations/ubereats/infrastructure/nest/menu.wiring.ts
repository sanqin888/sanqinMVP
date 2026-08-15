import type { Provider } from '@nestjs/common';
import { LoadUberMenuWorkflowUseCase } from '../../application/menu/load-uber-menu-workflow.use-case';
import { QueryUberMenuConfigUseCase } from '../../application/menu/query-uber-menu-config.use-case';
import { UpsertUberItemChannelConfigUseCase } from '../../application/menu/upsert-uber-item-channel-config.use-case';
import { UpsertUberOptionItemConfigUseCase } from '../../application/menu/upsert-uber-option-item-config.use-case';
import { ReadUberMenuDraftUseCase } from '../../application/menu/read-uber-menu-draft.use-case';
import { UpdateUberDraftItemUseCase } from '../../application/menu/update-uber-draft-item.use-case';
import { UpdateUberDraftGroupUseCase } from '../../application/menu/update-uber-draft-group.use-case';
import { UpdateUberDraftOptionUseCase } from '../../application/menu/update-uber-draft-option.use-case';
import { BindUberDraftOptionChildGroupUseCase } from '../../application/menu/bind-uber-draft-option-child-group.use-case';
import { UnbindUberDraftOptionChildGroupUseCase } from '../../application/menu/unbind-uber-draft-option-child-group.use-case';
import { QueryUberMenuDraftDiffUseCase } from '../../application/menu/query-uber-menu-draft-diff.use-case';
import { UberMenuAvailabilityUseCase } from '../../application/menu/uber-menu-availability.use-case';
import { PublishUberMenuUseCase } from '../../application/menu/publish-uber-menu.use-case';
import { ConfirmUberMenuPublicationUseCase } from '../../application/menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../../application/menu/recover-timed-out-menu-publications.use-case';
import {
  type MenuNotificationRepository,
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from '../../application/menu/uber-menu-notification.handler';
import {
  type UberMenuConfigQueryPort,
  type UberMenuWriteTransactionPort,
  type UberItemChannelConfigCommandPort,
  type UberOptionItemConfigCommandPort,
  type UberMenuDraftDiffPort,
  type UberDraftItemCommandPort,
  type UberDraftGroupCommandPort,
  type UberDraftOptionCommandPort,
  type UberOptionChildGroupBindCommandPort,
  type UberOptionChildGroupUnbindCommandPort,
  type UberMenuDraftReadPort,
  type MenuItemExistenceQueryPort,
  type OptionChoiceExistenceQueryPort,
  type ProvisionedUberStoreQueryPort,
  UBER_MENU_CONFIG_QUERY_PORT,
  UBER_MENU_WRITE_TRANSACTION_PORT,
  UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT,
  UBER_OPTION_ITEM_CONFIG_COMMAND_PORT,
  MENU_ITEM_EXISTENCE_QUERY_PORT,
  OPTION_CHOICE_EXISTENCE_QUERY_PORT,
  PROVISIONED_UBER_STORE_QUERY_PORT,
  UBER_BUSINESS_SCHEDULE_QUERY_PORT,
  UBER_MENU_DRAFT_DIFF_PORT,
  UBER_DRAFT_ITEM_COMMAND_PORT,
  UBER_DRAFT_GROUP_COMMAND_PORT,
  UBER_DRAFT_OPTION_COMMAND_PORT,
  UBER_OPTION_CHILD_GROUP_BIND_COMMAND_PORT,
  UBER_OPTION_CHILD_GROUP_UNBIND_COMMAND_PORT,
  UBER_MENU_DRAFT_READ_PORT,
} from '../../application/menu/uber-menu-draft.ports';
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
  UBER_PUBLIC_BASE_URL,
  type UberPublicBaseUrlPort,
} from '../../application/menu/uber-menu-publication.ports';
import {
  UBER_MENU_UNIT_OF_WORK,
  type UberMenuUnitOfWork,
} from '../../application/menu/uber-menu-repositories.ports';
import { UBER_MENU_AVAILABILITY_PORT } from '../../application/menu/uber-menu-availability.ports';
import {
  type UberMenuAvailabilityCommandPort,
  type UberMenuAvailabilityQueryPort,
  UBER_MENU_AVAILABILITY_COMMAND,
  UBER_MENU_AVAILABILITY_QUERY,
} from '../../application/menu/uber-menu-availability.ports';
import type { UberTelemetryPort } from '../../application/shared/uber-telemetry.port';
import { UBER_TELEMETRY_PORT } from '../../application/shared/uber-telemetry.port';
import { UberMenuAvailabilityPrismaAdapter } from '../../infrastructure/persistence/uber-menu-availability-prisma.adapter';
import { PrismaUberMenuUnitOfWork } from '../../infrastructure/persistence/uber-menu-draft.repositories';
import { UberMenuNotificationPrismaRepository } from '../../infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuPublicationPrismaAdapter } from '../../infrastructure/persistence/uber-menu-publication-prisma.adapter';
import { UberMenuSnapshotPrismaAdapter } from '../../infrastructure/persistence/uber-menu-snapshot-prisma.adapter';
import { UberMenuConfigQueryPrismaAdapter } from '../../infrastructure/persistence/uber-menu-config-query-prisma.adapter';
import { UberMenuConfigWritePrismaAdapter } from '../../infrastructure/persistence/uber-menu-config-write-prisma.adapter';
import { UberMenuWriteTransactionPrismaAdapter } from '../../infrastructure/persistence/uber-menu-write-transaction-prisma.adapter';
import { UberMenuDraftReadPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-read-prisma.adapter';
import { UberMenuDraftMutationPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-mutation-prisma.adapter';
import { UberMenuDraftDiffPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-diff-prisma.adapter';
import { UberMenuSupportingQueriesPrismaAdapter } from '../../infrastructure/persistence/uber-menu-supporting-queries-prisma.adapter';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from '../../infrastructure/uber-api/uber-menu-publication.adapter';
import {
  DEFAULT_UBER_IMAGE_POLICY,
  UBER_IMAGE_POLICY,
  UberImageValidator,
} from '../../infrastructure/uber-api/uber-image.validator';
import { UberMenuGateway } from '../../infrastructure/uber-api/uber-resource.gateways';
import { UBER_EATS_MENU_AVAILABILITY } from '../../public-api';
import { presentAvailabilitySync } from '../../contracts/responses/public-contract.mapper';
import { UberPublicBaseUrlAdapter } from '../config/uber-public-base-url.adapter';
import { UberMenuConfigImportUseCase } from '../../application/menu/uber-menu-config-import.use-case';
import {
  UBER_MENU_CONFIG_IMPORT_PORT,
  type UberMenuConfigImportPort,
} from '../../application/menu/uber-menu-config-import.ports';
import { UberMenuConfigImportPrismaAdapter } from '../persistence/uber-menu-config-import-prisma.adapter';

export function createMenuWiring(): Provider[] {
  return [
    UberMenuGateway,
    { provide: UBER_IMAGE_POLICY, useValue: DEFAULT_UBER_IMAGE_POLICY },
    UberImageValidator,
    UberMenuConfigQueryPrismaAdapter,
    UberMenuConfigWritePrismaAdapter,
    UberMenuConfigImportPrismaAdapter,
    {
      provide: UBER_MENU_CONFIG_IMPORT_PORT,
      useExisting: UberMenuConfigImportPrismaAdapter,
    },
    UberMenuWriteTransactionPrismaAdapter,
    {
      provide: UBER_MENU_WRITE_TRANSACTION_PORT,
      useExisting: UberMenuWriteTransactionPrismaAdapter,
    },
    {
      provide: UberPublicBaseUrlAdapter,
      useFactory: () => new UberPublicBaseUrlAdapter(process.env),
    },
    { provide: UBER_PUBLIC_BASE_URL, useExisting: UberPublicBaseUrlAdapter },
    UberMenuDraftReadPrismaAdapter,
    UberMenuDraftMutationPrismaAdapter,
    UberMenuDraftDiffPrismaAdapter,
    UberMenuSupportingQueriesPrismaAdapter,
    {
      provide: UBER_MENU_CONFIG_QUERY_PORT,
      useExisting: UberMenuConfigQueryPrismaAdapter,
    },
    {
      provide: UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT,
      useExisting: UberMenuConfigWritePrismaAdapter,
    },
    {
      provide: UBER_OPTION_ITEM_CONFIG_COMMAND_PORT,
      useExisting: UberMenuConfigWritePrismaAdapter,
    },
    {
      provide: UBER_MENU_DRAFT_READ_PORT,
      useExisting: UberMenuDraftReadPrismaAdapter,
    },
    {
      provide: UBER_DRAFT_ITEM_COMMAND_PORT,
      useExisting: UberMenuDraftMutationPrismaAdapter,
    },
    {
      provide: UBER_DRAFT_GROUP_COMMAND_PORT,
      useExisting: UberMenuDraftMutationPrismaAdapter,
    },
    {
      provide: UBER_DRAFT_OPTION_COMMAND_PORT,
      useExisting: UberMenuDraftMutationPrismaAdapter,
    },
    {
      provide: UBER_OPTION_CHILD_GROUP_BIND_COMMAND_PORT,
      useExisting: UberMenuDraftMutationPrismaAdapter,
    },
    {
      provide: UBER_OPTION_CHILD_GROUP_UNBIND_COMMAND_PORT,
      useExisting: UberMenuDraftMutationPrismaAdapter,
    },
    {
      provide: UBER_MENU_DRAFT_DIFF_PORT,
      useExisting: UberMenuDraftDiffPrismaAdapter,
    },
    {
      provide: MENU_ITEM_EXISTENCE_QUERY_PORT,
      useExisting: UberMenuSupportingQueriesPrismaAdapter,
    },
    {
      provide: OPTION_CHOICE_EXISTENCE_QUERY_PORT,
      useExisting: UberMenuSupportingQueriesPrismaAdapter,
    },
    {
      provide: PROVISIONED_UBER_STORE_QUERY_PORT,
      useExisting: UberMenuSupportingQueriesPrismaAdapter,
    },
    {
      provide: UBER_BUSINESS_SCHEDULE_QUERY_PORT,
      useExisting: UberMenuSupportingQueriesPrismaAdapter,
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
      provide: QueryUberMenuConfigUseCase,
      inject: [UBER_MENU_CONFIG_QUERY_PORT],
      useFactory: (queries: UberMenuConfigQueryPort) =>
        new QueryUberMenuConfigUseCase(queries),
    },
    {
      provide: UberMenuConfigImportUseCase,
      inject: [UBER_MENU_CONFIG_IMPORT_PORT],
      useFactory: (imports: UberMenuConfigImportPort) =>
        new UberMenuConfigImportUseCase(imports),
    },
    {
      provide: UpsertUberItemChannelConfigUseCase,
      inject: [
        UBER_MENU_WRITE_TRANSACTION_PORT,
        MENU_ITEM_EXISTENCE_QUERY_PORT,
      ],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberItemChannelConfigCommandPort>,
        menuItems: MenuItemExistenceQueryPort,
      ) => new UpsertUberItemChannelConfigUseCase(transaction, menuItems),
    },
    {
      provide: UpsertUberOptionItemConfigUseCase,
      inject: [
        UBER_MENU_WRITE_TRANSACTION_PORT,
        OPTION_CHOICE_EXISTENCE_QUERY_PORT,
      ],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberOptionItemConfigCommandPort>,
        optionChoices: OptionChoiceExistenceQueryPort,
      ) => new UpsertUberOptionItemConfigUseCase(transaction, optionChoices),
    },
    {
      provide: ReadUberMenuDraftUseCase,
      inject: [UBER_MENU_DRAFT_READ_PORT],
      useFactory: (drafts: UberMenuDraftReadPort) =>
        new ReadUberMenuDraftUseCase(drafts),
    },
    {
      provide: UpdateUberDraftItemUseCase,
      inject: [
        UBER_MENU_WRITE_TRANSACTION_PORT,
        MENU_ITEM_EXISTENCE_QUERY_PORT,
      ],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberDraftItemCommandPort>,
        menuItems: MenuItemExistenceQueryPort,
      ) => new UpdateUberDraftItemUseCase(transaction, menuItems),
    },
    {
      provide: UpdateUberDraftGroupUseCase,
      inject: [UBER_MENU_WRITE_TRANSACTION_PORT],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberDraftGroupCommandPort>,
      ) => new UpdateUberDraftGroupUseCase(transaction),
    },
    {
      provide: UpdateUberDraftOptionUseCase,
      inject: [
        UBER_MENU_WRITE_TRANSACTION_PORT,
        OPTION_CHOICE_EXISTENCE_QUERY_PORT,
      ],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberDraftOptionCommandPort>,
        optionChoices: OptionChoiceExistenceQueryPort,
      ) => new UpdateUberDraftOptionUseCase(transaction, optionChoices),
    },
    {
      provide: BindUberDraftOptionChildGroupUseCase,
      inject: [UBER_MENU_WRITE_TRANSACTION_PORT],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberOptionChildGroupBindCommandPort>,
      ) => new BindUberDraftOptionChildGroupUseCase(transaction),
    },
    {
      provide: UnbindUberDraftOptionChildGroupUseCase,
      inject: [UBER_MENU_WRITE_TRANSACTION_PORT],
      useFactory: (
        transaction: UberMenuWriteTransactionPort<UberOptionChildGroupUnbindCommandPort>,
      ) => new UnbindUberDraftOptionChildGroupUseCase(transaction),
    },
    {
      provide: QueryUberMenuDraftDiffUseCase,
      inject: [UBER_MENU_DRAFT_DIFF_PORT],
      useFactory: (diffs: UberMenuDraftDiffPort) =>
        new QueryUberMenuDraftDiffUseCase(diffs),
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
        PROVISIONED_UBER_STORE_QUERY_PORT,
        UBER_MENU_SNAPSHOT_REPOSITORY,
        UBER_MENU_PUBLICATION_REPOSITORY,
        UBER_MENU_GATEWAY,
        UBER_MENU_IMAGE_PROBE,
        UBER_PUBLIC_BASE_URL,
      ],
      useFactory: (
        provisionedStores: ProvisionedUberStoreQueryPort,
        snapshots: UberMenuSnapshotRepositoryPort,
        publications: UberMenuPublicationRepositoryPort,
        gateway: UberMenuGatewayPort,
        images: UberMenuImageProbePort,
        urls: UberPublicBaseUrlPort,
      ) =>
        new PublishUberMenuUseCase(
          provisionedStores,
          snapshots,
          publications,
          gateway,
          images,
          urls,
        ),
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
      ) =>
        new UberMenuAvailabilityUseCase(queries, commands, publish, telemetry),
    },
    {
      provide: UBER_MENU_AVAILABILITY_PORT,
      useExisting: UberMenuAvailabilityUseCase,
    },
    {
      provide: UBER_EATS_MENU_AVAILABILITY,
      inject: [UberMenuAvailabilityUseCase],
      useFactory: (availability: UberMenuAvailabilityUseCase) => ({
        syncUberMenuItemAvailability: async (
          input: Parameters<
            UberMenuAvailabilityUseCase['syncUberMenuItemAvailability']
          >[0],
        ) =>
          presentAvailabilitySync(
            await availability.syncUberMenuItemAvailability(input),
          ),
        syncUberOptionItemAvailability: async (
          input: Parameters<
            UberMenuAvailabilityUseCase['syncUberOptionItemAvailability']
          >[0],
        ) =>
          presentAvailabilitySync(
            await availability.syncUberOptionItemAvailability(input),
          ),
      }),
    },
  ];
}
