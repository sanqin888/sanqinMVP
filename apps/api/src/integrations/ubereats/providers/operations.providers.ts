import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../application/shared/uber-telemetry.port';
import type { Provider } from '@nestjs/common';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from '../application/operations/uber-operations.use-cases';
import { UberMenuAvailabilityUseCase } from '../application/menu/uber-menu-availability.use-case';
import { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import { SyncUberStoreStatusUseCase } from '../application/merchant/uber-merchant-provisioning.service';
import { SyncUberOrderStatusUseCase } from '../application/orders/sync-uber-order-status.use-case';
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
} from '../application/operations/uber-operations.ports';
import {
  UberMenuItemOperationsPrismaRepository,
  UberOperationsPrismaUnitOfWork,
  UberOpsTicketPrismaRepository,
  UberOrderOperationsPrismaRepository,
  UberReconciliationPrismaRepository,
} from '../infrastructure/persistence/uber-operations-prisma.repositories';

export const UBER_EATS_OPERATIONS_PROVIDERS: Provider[] = [
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

export const UBER_EATS_OPERATIONS_EXPORTS = [
  GenerateUberReconciliationReportUseCase,
  CreateUberOpsTicketUseCase,
  RetryUberOpsTicketUseCase,
  QueryUberOperationsSummary,
];
