import { Inject, Injectable } from '@nestjs/common';
type UberOpsTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
import type {
  CreateOpsTicketInput,
  GenerateReconciliationReportInput,
} from '../../domain/operations/uber-operations.types';

export type CreateUberOpsTicketCommand = Omit<
  CreateOpsTicketInput,
  'context'
> & {
  targetOrderStatus?: string;
  isAvailable?: boolean;
  uberStoreId?: string;
  targetStoreStatus?: 'ONLINE' | 'PAUSED';
  publish?: {
    storeId?: string;
    timezoneConfirmed?: boolean;
    taxRateConfirmed?: boolean;
    excludedCategoryIds?: string[];
    excludedGroupIds?: string[];
    excludedMenuItemStableIds?: string[];
    excludedOptionChoiceStableIds?: string[];
  };
};

export const mapCreateUberOpsTicketCommand = (
  command: CreateUberOpsTicketCommand,
): CreateOpsTicketInput => {
  const base = {
    type: command.type,
    title: command.title,
    description: command.description,
    priority: command.priority,
    storeId: command.storeId,
    externalOrderId: command.externalOrderId,
    menuItemStableId: command.menuItemStableId,
  };

  switch (command.type) {
    case 'ORDER_STATUS_SYNC':
      return {
        ...base,
        context: { targetStatus: command.targetOrderStatus! },
      };
    case 'MENU_ITEM_AVAILABILITY':
      return { ...base, context: { isAvailable: command.isAvailable! } };
    case 'STORE_STATUS_SYNC':
      return {
        ...base,
        context: {
          uberStoreId: command.uberStoreId!,
          targetStatus: command.targetStoreStatus!,
        },
      };
    case 'MENU_PUBLISH':
      return {
        ...base,
        context: {
          publish: {
            ...command.publish,
            storeId: command.publish?.storeId ?? command.storeId!,
            dryRun: false,
          },
        },
      };
    default:
      return base;
  }
};
export const UBER_OPERATIONS_PORT = Symbol('UBER_OPERATIONS_PORT');
export interface UberOperationsPort {
  generateReconciliationReport(
    input: GenerateReconciliationReportInput,
  ): Promise<any>;
  listReconciliationReports(storeId?: string, limit?: number): Promise<any>;
  getReconciliationSummary(storeId?: string): Promise<any>;
  createOpsTicket(input: CreateOpsTicketInput): Promise<any>;
  retryOpsTicket(id: string): Promise<any>;
  listOpsTickets(storeId?: string, status?: UberOpsTicketStatus): Promise<any>;
  getOpsTicketsSummary(
    storeId?: string,
    status?: UberOpsTicketStatus,
  ): Promise<any>;
}
@Injectable()
export class GenerateUberReconciliationReportUseCase {
  constructor(
    @Inject(UBER_OPERATIONS_PORT)
    private readonly operations: UberOperationsPort,
  ) {}
  execute(input: GenerateReconciliationReportInput) {
    return this.operations.generateReconciliationReport(input);
  }
}
@Injectable()
export class CreateUberOpsTicketUseCase {
  constructor(
    @Inject(UBER_OPERATIONS_PORT)
    private readonly operations: UberOperationsPort,
  ) {}
  execute(command: CreateUberOpsTicketCommand) {
    return this.operations.createOpsTicket(
      mapCreateUberOpsTicketCommand(command),
    );
  }
}
@Injectable()
export class RetryUberOpsTicketUseCase {
  constructor(
    @Inject(UBER_OPERATIONS_PORT)
    private readonly operations: UberOperationsPort,
  ) {}
  execute(id: string) {
    return this.operations.retryOpsTicket(id);
  }
}
@Injectable()
export class QueryUberOperationsSummary {
  constructor(
    @Inject(UBER_OPERATIONS_PORT)
    private readonly operations: UberOperationsPort,
  ) {}
  listReports(storeId?: string, limit?: number) {
    return this.operations.listReconciliationReports(storeId, limit);
  }
  reconciliation(storeId?: string) {
    return this.operations.getReconciliationSummary(storeId);
  }
  listTickets(storeId?: string, status?: UberOpsTicketStatus) {
    return this.operations.listOpsTickets(storeId, status);
  }
  tickets(storeId?: string, status?: UberOpsTicketStatus) {
    return this.operations.getOpsTicketsSummary(storeId, status);
  }
}
