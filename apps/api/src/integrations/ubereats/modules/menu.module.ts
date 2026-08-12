import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LoadUberMenuWorkflowUseCase } from '../application/menu/load-uber-menu-workflow.use-case';
import { UberMenuDraftUseCase } from '../application/menu/uber-menu-draft.use-case';
import { UberMenuDraftConfigUseCase } from '../application/menu/uber-menu-draft-config.use-case';
import { UberMenuAvailabilityUseCase } from '../application/menu/uber-menu-availability.use-case';
import { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import { ConfirmUberMenuPublicationUseCase } from '../application/menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../application/menu/recover-timed-out-menu-publications.use-case';
import {
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from '../application/menu/uber-menu-notification.handler';
import {
  UBER_MENU_DRAFT_COMMAND_PORT,
  UBER_MENU_DRAFT_QUERY_PORT,
} from '../application/ports/uber-menu-draft.ports';
import {
  UBER_MENU_GATEWAY,
  UBER_MENU_IMAGE_PROBE,
  UBER_MENU_PUBLICATION_REPOSITORY,
  UBER_MENU_PUBLISH_COMMAND,
  UBER_MENU_SNAPSHOT_REPOSITORY,
} from '../application/ports/uber-menu-publication.ports';
import { UBER_MENU_UNIT_OF_WORK } from '../application/ports/uber-menu-repositories.ports';
import {
  UBER_MENU_AVAILABILITY_PORT,
  UBER_MENU_DRAFT_PORT,
} from '../application/ports/uber-use-case.ports';
import { UberMenuAvailabilityGateway } from '../infrastructure/menu/uber-menu-availability.gateway';
import { PrismaUberMenuUnitOfWork } from '../infrastructure/persistence/uber-menu-draft.repositories';
import { UberMenuNotificationPrismaRepository } from '../infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuPublicationPrismaAdapter } from '../infrastructure/persistence/uber-menu-publication-prisma.adapter';
import { UberMenuSnapshotPrismaAdapter } from '../infrastructure/persistence/uber-menu-snapshot-prisma.adapter';
import { UberMenuDraftGateway } from '../infrastructure/persistence/uber-menu-workflow-prisma.repository';
import {
  UberMenuDraftCommandPrismaRepository,
  UberMenuDraftQueryPrismaRepository,
} from '../infrastructure/persistence/uber-menu.repository';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from '../infrastructure/uber-api/uber-menu-publication.adapter';
import { UberImageValidator } from '../infrastructure/uber-api/uber-image.validator';
import { UberMenuGateway } from '../infrastructure/uber-api/uber-resource.gateways';
import { UberEatsInternalInfrastructureModule } from './ubereats-internal-infrastructure.module';

export const UBER_EATS_MENU_PROVIDERS = [
  UberMenuGateway,
  UberImageValidator,
  UberMenuDraftGateway,
  { provide: UBER_MENU_DRAFT_PORT, useExisting: UberMenuDraftGateway },
  UberMenuAvailabilityGateway,
  {
    provide: UBER_MENU_AVAILABILITY_PORT,
    useExisting: UberMenuAvailabilityGateway,
  },
  UberMenuDraftQueryPrismaRepository,
  UberMenuDraftCommandPrismaRepository,
  {
    provide: UBER_MENU_DRAFT_QUERY_PORT,
    useExisting: UberMenuDraftQueryPrismaRepository,
  },
  {
    provide: UBER_MENU_DRAFT_COMMAND_PORT,
    useExisting: UberMenuDraftCommandPrismaRepository,
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
    inject: [UBER_MENU_DRAFT_PORT],
    useFactory: (drafts) => new UberMenuDraftUseCase(drafts),
  },
  {
    provide: UberMenuDraftConfigUseCase,
    inject: [UBER_MENU_DRAFT_QUERY_PORT, UBER_MENU_DRAFT_COMMAND_PORT],
    useFactory: (queries, commands) =>
      new UberMenuDraftConfigUseCase(queries, commands),
  },
  {
    provide: LoadUberMenuWorkflowUseCase,
    inject: [UBER_MENU_UNIT_OF_WORK],
    useFactory: (unitOfWork) => new LoadUberMenuWorkflowUseCase(unitOfWork),
  },
  {
    provide: PublishUberMenuUseCase,
    inject: [
      UBER_MENU_SNAPSHOT_REPOSITORY,
      UBER_MENU_PUBLICATION_REPOSITORY,
      UBER_MENU_GATEWAY,
      UBER_MENU_IMAGE_PROBE,
    ],
    useFactory: (snapshots, publications, gateway, images) =>
      new PublishUberMenuUseCase(snapshots, publications, gateway, images),
  },
  { provide: UBER_MENU_PUBLISH_COMMAND, useExisting: PublishUberMenuUseCase },
  {
    provide: ConfirmUberMenuPublicationUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY, UBER_MENU_GATEWAY],
    useFactory: (publications, gateway) =>
      new ConfirmUberMenuPublicationUseCase(publications, gateway),
  },
  {
    provide: RecoverTimedOutMenuPublicationsUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY],
    useFactory: (publications) =>
      new RecoverTimedOutMenuPublicationsUseCase(publications),
  },
  {
    provide: UberMenuNotificationHandler,
    inject: [MENU_NOTIFICATION_REPOSITORY],
    useFactory: (repository) => new UberMenuNotificationHandler(repository),
  },
  {
    provide: UberMenuAvailabilityUseCase,
    inject: [UBER_MENU_AVAILABILITY_PORT],
    useFactory: (availability) => new UberMenuAvailabilityUseCase(availability),
  },
];

export const UBER_EATS_MENU_EXPORTS = [
  UberMenuDraftUseCase,
  UberMenuDraftConfigUseCase,
  PublishUberMenuUseCase,
  ConfirmUberMenuPublicationUseCase,
  RecoverTimedOutMenuPublicationsUseCase,
  UberMenuNotificationHandler,
  UberMenuAvailabilityUseCase,
];

@Module({
  imports: [PrismaModule, UberEatsInternalInfrastructureModule],
  providers: UBER_EATS_MENU_PROVIDERS,
  exports: UBER_EATS_MENU_EXPORTS,
})
export class UberEatsMenuModule {}
