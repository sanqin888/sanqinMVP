import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import {
  executeUberMutation,
  toUberListResponse,
} from '../contracts/responses/ubereats.responses';
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
    return await this.generateReport.execute({
      storeId: dto.storeId,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
    });
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
    return toUberListResponse(result.items, query.limit);
  }

  @Get('reports/reconciliation/summary')
  async reconciliationSummary(@Query() query: ReportListQuery) {
    return this.queries.reconciliation(query.storeId);
  }

  @Post('ops/tickets')
  @UberAdminWrite()
  async createOpsTicket(@Body() dto: CreateUberOpsTicketDto): Promise<unknown> {
    return await this.createTicket.execute(dto);
  }

  @Get('ops/tickets')
  async listOpsTickets(@Query() query: OpsTicketListQuery): Promise<unknown> {
    const result = await this.queries.listTickets(query.storeId, query.status);
    return toUberListResponse(
      result.items.map((ticket) => ({
        ticketStableId: ticket.ticketStableId,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        externalOrderId: ticket.externalOrderId,
        menuItemStableId: ticket.menuItemStableId,
        retryCount: ticket.retryCount,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
      200,
    );
  }

  @Get('ops/tickets/summary')
  async opsTicketsSummary(@Query() query: OpsTicketListQuery) {
    return this.queries.tickets(query.storeId, query.status);
  }

  @Post('ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicket(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ): Promise<unknown> {
    return await this.retryTicket.execute(ticketStableId);
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
