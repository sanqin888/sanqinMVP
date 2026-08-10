import { Inject, Injectable } from '@nestjs/common';
import type { UberOpsTicketStatus } from '@prisma/client';
import type {
  CreateOpsTicketInput,
  GenerateReconciliationReportInput,
} from '../../domain/operations/uber-operations.types';
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
  execute(input: CreateOpsTicketInput) {
    return this.operations.createOpsTicket(input);
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
