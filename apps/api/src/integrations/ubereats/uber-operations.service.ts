import { Injectable } from '@nestjs/common';
import { UberEatsService } from './ubereats.service';

/** Reconciliation, operations tickets and audit-event boundary. */
@Injectable()
export class UberOperationsService {
  constructor(private readonly facade: UberEatsService) {}

  generateReconciliationReport(
    ...args: Parameters<UberEatsService['generateReconciliationReport']>
  ) {
    return this.facade.generateReconciliationReport(...args);
  }
  listReconciliationReports(
    ...args: Parameters<UberEatsService['listReconciliationReports']>
  ) {
    return this.facade.listReconciliationReports(...args);
  }
  createOpsTicket(...args: Parameters<UberEatsService['createOpsTicket']>) {
    return this.facade.createOpsTicket(...args);
  }
  listOpsTickets(...args: Parameters<UberEatsService['listOpsTickets']>) {
    return this.facade.listOpsTickets(...args);
  }
  retryOpsTicket(...args: Parameters<UberEatsService['retryOpsTicket']>) {
    return this.facade.retryOpsTicket(...args);
  }
}
