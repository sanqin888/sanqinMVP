import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
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
  UBER_MENU_ITEM_OPERATIONS_REPOSITORY,
  UBER_OPERATIONS_UNIT_OF_WORK,
  UBER_OPS_TICKET_REPOSITORY,
  UBER_ORDER_OPERATIONS_REPOSITORY,
  UBER_RECONCILIATION_REPOSITORY,
} from '../application/ports/uber-operations.ports';
import { UBER_TELEMETRY_PORT } from '../application/ports/uber-order-processing.ports';
import {
  UberMenuItemOperationsPrismaRepository,
  UberOperationsPrismaUnitOfWork,
  UberOpsTicketPrismaRepository,
  UberOrderOperationsPrismaRepository,
  UberReconciliationPrismaRepository,
} from '../infrastructure/persistence/uber-operations-prisma.repositories';
import { UberEatsInternalInfrastructureModule } from './ubereats-internal-infrastructure.module';
import { UberEatsMenuModule } from './menu.module';
import { UberEatsMerchantModule } from './merchant.module';
import { UberEatsOrdersModule } from './orders.module';

export const UBER_EATS_OPERATIONS_PROVIDERS = [
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
    useFactory: (orders, reports, tickets, telemetry) =>
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
    useFactory: (tickets, orders, menuItems, telemetry) =>
      new CreateUberOpsTicketUseCase(tickets, orders, menuItems, telemetry),
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
      unitOfWork,
      orders,
      publish,
      availability,
      stores,
      telemetry,
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
    useFactory: (reports, tickets) =>
      new QueryUberOperationsSummary(reports, tickets),
  },
];

export const UBER_EATS_OPERATIONS_EXPORTS = [
  GenerateUberReconciliationReportUseCase,
  CreateUberOpsTicketUseCase,
  RetryUberOpsTicketUseCase,
  QueryUberOperationsSummary,
];

@Module({
  imports: [
    PrismaModule,
    UberEatsInternalInfrastructureModule,
    UberEatsOrdersModule,
    UberEatsMenuModule,
    UberEatsMerchantModule,
  ],
  providers: UBER_EATS_OPERATIONS_PROVIDERS,
  exports: UBER_EATS_OPERATIONS_EXPORTS,
})
export class UberEatsOperationsModule {}
