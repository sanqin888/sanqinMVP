import { Injectable } from '@nestjs/common';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from './uber-operations.use-cases';
/** Transport facade only; transactions and idempotency are owned by focused use cases. */
@Injectable()
export class UberOperationsApplication {
  constructor(
    private readonly reports: GenerateUberReconciliationReportUseCase,
    private readonly createTicket: CreateUberOpsTicketUseCase,
    private readonly retryTicket: RetryUberOpsTicketUseCase,
    private readonly queries: QueryUberOperationsSummary,
  ) {}
  generateReconciliationReport(
    ...a: Parameters<GenerateUberReconciliationReportUseCase['execute']>
  ) {
    return this.reports.execute(...a);
  }
  listReconciliationReports(
    ...a: Parameters<QueryUberOperationsSummary['listReports']>
  ) {
    return this.queries.listReports(...a);
  }
  getReconciliationSummary(
    ...a: Parameters<QueryUberOperationsSummary['reconciliation']>
  ) {
    return this.queries.reconciliation(...a);
  }
  createOpsTicket(...a: Parameters<CreateUberOpsTicketUseCase['execute']>) {
    return this.createTicket.execute(...a);
  }
  retryOpsTicket(...a: Parameters<RetryUberOpsTicketUseCase['execute']>) {
    return this.retryTicket.execute(...a);
  }
  listOpsTickets(...a: Parameters<QueryUberOperationsSummary['listTickets']>) {
    return this.queries.listTickets(...a);
  }
  getOpsTicketsSummary(
    ...a: Parameters<QueryUberOperationsSummary['tickets']>
  ) {
    return this.queries.tickets(...a);
  }
}
