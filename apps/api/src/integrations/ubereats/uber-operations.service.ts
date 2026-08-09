import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationRuntime } from './uber-integration.runtime';

/** Reconciliation reports, operations tickets, retries and auditing. */
@Injectable()
export class UberOperationsService {
  private readonly runtime: UberIntegrationRuntime;

  constructor(
    prisma: PrismaService,
    uberAuthService: UberAuthService,
    @Optional() orderEventsBus?: OrderEventsBus,
    @Optional() orderIngestionService?: OrderIngestionService,
    @Optional() httpClient?: UberHttpClient,
    @Optional() config?: UberConfigService,
  ) {
    this.runtime = new UberIntegrationRuntime(
      prisma,
      uberAuthService,
      orderEventsBus,
      orderIngestionService,
      httpClient,
      config,
    );
  }

  generateReconciliationReport(
    ...args: Parameters<UberIntegrationRuntime['generateReconciliationReport']>
  ): ReturnType<UberIntegrationRuntime['generateReconciliationReport']> {
    return this.runtime.generateReconciliationReport(...args);
  }

  listReconciliationReports(
    ...args: Parameters<UberIntegrationRuntime['listReconciliationReports']>
  ): ReturnType<UberIntegrationRuntime['listReconciliationReports']> {
    return this.runtime.listReconciliationReports(...args);
  }

  createOpsTicket(
    ...args: Parameters<UberIntegrationRuntime['createOpsTicket']>
  ): ReturnType<UberIntegrationRuntime['createOpsTicket']> {
    return this.runtime.createOpsTicket(...args);
  }

  listOpsTickets(
    ...args: Parameters<UberIntegrationRuntime['listOpsTickets']>
  ): ReturnType<UberIntegrationRuntime['listOpsTickets']> {
    return this.runtime.listOpsTickets(...args);
  }

  retryOpsTicket(
    ...args: Parameters<UberIntegrationRuntime['retryOpsTicket']>
  ): ReturnType<UberIntegrationRuntime['retryOpsTicket']> {
    return this.runtime.retryOpsTicket(...args);
  }
}
