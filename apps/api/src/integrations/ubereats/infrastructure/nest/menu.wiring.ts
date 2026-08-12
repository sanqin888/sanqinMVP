import type { Provider } from '@nestjs/common';
import { LoadUberMenuWorkflowUseCase } from '../../application/menu/load-uber-menu-workflow.use-case';
import { UberMenuDraftUseCase } from '../../application/menu/uber-menu-draft.use-case';
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
import { UberMenuDraftReadPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-read-prisma.adapter';
import { UberMenuDraftMutationPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-mutation-prisma.adapter';
import { UberMenuDraftDiffPrismaAdapter } from '../../infrastructure/persistence/uber-menu-draft-diff-prisma.adapter';
import { UberMenuReferenceQueryPrismaAdapter } from '../../infrastructure/persistence/uber-menu-reference-query-prisma.adapter';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from '../../infrastructure/uber-api/uber-menu-publication.adapter';
import { UberImageValidator } from '../../infrastructure/uber-api/uber-image.validator';
import { UberMenuGateway } from '../../infrastructure/uber-api/uber-resource.gateways';
import { UBER_EATS_MENU_AVAILABILITY } from '../../public-api';
import { presentAvailabilitySync } from '../../contracts/responses/public-contract.mapper';

export function createMenuWiring(): Provider[] {
  return [
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
