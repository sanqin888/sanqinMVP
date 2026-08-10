import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import { executeUberMutation } from '../contracts/responses/ubereats.responses';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  CreateUberOpsTicketDto,
  GenerateUberReconciliationReportDto,
  OpsTicketListQuery,
  ReportListQuery,
} from '../contracts/requests/ubereats.requests';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
} from '../application/operations/uber-operations.use-cases';
import {
  presentOperationMutation,
  presentOperationsSummary,
  presentOpsTickets,
} from './operations.presenter';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsOperationsController {
  constructor(
    private readonly generateReport: GenerateUberReconciliationReportUseCase,
    private readonly createTicket: CreateUberOpsTicketUseCase,
    private readonly retryTicket: RetryUberOpsTicketUseCase,
    private readonly queries: QueryUberOperationsSummary,
  ) {}
  @Post('reports/reconciliation/generate')
  @UberAdminWrite()
  async generateReconciliationReport(
    @Body() dto: GenerateUberReconciliationReportDto,
  ) {
    await this.generateReport.execute({
      storeId: dto.storeId,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
    });
    return presentOperationMutation();
  }

  @Post('v2/reports/reconciliation/generate')
  @UberAdminWrite()
  async generateReconciliationReportV2(
    @Body() dto: GenerateUberReconciliationReportDto,
  ) {
    return executeUberMutation(() =>
      this.generateReport.execute({
        storeId: dto.storeId,
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
      }),
    );
  }

  @Get('reports/reconciliation')
  async listReconciliationReports(@Query() query: ReportListQuery) {
    const result = await this.queries.listReports(query.storeId, query.limit);
    return presentOpsTickets(result);
  }

  @Get('reports/reconciliation/summary')
  async reconciliationSummary(@Query() query: ReportListQuery) {
    return presentOperationsSummary(
      await this.queries.reconciliation(query.storeId),
    );
  }

  @Post('ops/tickets')
  @UberAdminWrite()
  async createOpsTicket(@Body() dto: CreateUberOpsTicketDto): Promise<unknown> {
    await this.createTicket.execute(dto);
    return presentOperationMutation();
  }

  @Get('ops/tickets')
  async listOpsTickets(@Query() query: OpsTicketListQuery): Promise<unknown> {
    const result = await this.queries.listTickets(query.storeId, query.status);
    return presentOpsTickets(result);
  }

  @Get('ops/tickets/summary')
  async opsTicketsSummary(@Query() query: OpsTicketListQuery) {
    return presentOperationsSummary(
      await this.queries.tickets(query.storeId, query.status),
    );
  }

  @Post('ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicket(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ): Promise<unknown> {
    await this.retryTicket.execute(ticketStableId);
    return presentOperationMutation();
  }

  @Post('v2/ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicketV2(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ) {
    return executeUberMutation(() => this.retryTicket.execute(ticketStableId), {
      accepted: true,
    });
  }
}
