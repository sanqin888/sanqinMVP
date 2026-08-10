import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Header,
  HttpCode,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UberOpsTicketStatus, UberOpsTicketType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { SESSION_COOKIE_NAME } from '../../auth/session-auth.guard';
import { ResourceIdPipe } from './contracts/requests/resource-id.pipe';
import {
  executeUberMutation,
  toUberListResponse,
} from './contracts/responses/ubereats.responses';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  CreateUberOpsTicketDto,
  GenerateUberReconciliationReportDto,
  MerchantQuery,
  OAuthCallbackQuery,
  OpsTicketListQuery,
  ProvisionUberStoreDto,
  PublishUberMenuDto,
  ReportListQuery,
  ResourceIdParam,
  StoreIdQuery,
  SyncUberMenuItemAvailabilityDto,
  SyncUberOptionItemAvailabilityDto,
  UpdatePosExternalStoreIdDto,
  UpdateUberDraftGroupDto,
  UpdateUberDraftItemDto,
  UpdateUberDraftOptionChildGroupDto,
  UpdateUberDraftOptionDto,
  UpsertUberOptionItemConfigDto,
  UpsertUberPriceBookItemDto,
} from './contracts/requests/ubereats.requests';
import { UberOperationsService } from './uber-operations.service';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsOperationsController {
  private readonly logger = new AppLogger(UberEatsOperationsController.name);
  constructor(private readonly operations: UberOperationsService) {}
  @Post('reports/reconciliation/generate')
  @UberAdminWrite()
  async generateReconciliationReport(
    @Body() dto: GenerateUberReconciliationReportDto,
  ) {
    return await this.operations.generateReconciliationReport({
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
      this.operations.generateReconciliationReport({
        storeId: dto.storeId,
        rangeStart: dto.rangeStart,
        rangeEnd: dto.rangeEnd,
      }),
    );
  }

  @Get('reports/reconciliation')
  async listReconciliationReports(@Query() query: ReportListQuery) {
    const result = await this.operations.listReconciliationReports(
      query.storeId,
      query.limit,
    );
    return toUberListResponse(result.items, query.limit);
  }

  @Post('ops/tickets')
  @UberAdminWrite()
  async createOpsTicket(@Body() dto: CreateUberOpsTicketDto): Promise<unknown> {
    const context =
      dto.type === UberOpsTicketType.ORDER_STATUS_SYNC
        ? { targetStatus: dto.targetOrderStatus }
        : dto.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY
          ? { isAvailable: dto.isAvailable }
          : dto.type === UberOpsTicketType.STORE_STATUS_SYNC
            ? {
                uberStoreId: dto.uberStoreId,
                targetStatus: dto.targetStoreStatus,
              }
            : dto.type === UberOpsTicketType.MENU_PUBLISH
              ? {
                  publish: {
                    ...dto.publish,
                    storeId: dto.publish?.storeId ?? dto.storeId,
                    dryRun: false,
                  },
                }
              : undefined;
    return await this.operations.createOpsTicket({
      type: dto.type,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      storeId: dto.storeId,
      externalOrderId: dto.externalOrderId,
      menuItemStableId: dto.menuItemStableId,
      context,
    });
  }

  @Get('ops/tickets')
  async listOpsTickets(@Query() query: OpsTicketListQuery): Promise<unknown> {
    const result = await this.operations.listOpsTickets(
      query.storeId,
      query.status,
    );
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

  @Post('ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicket(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ): Promise<unknown> {
    return await this.operations.retryOpsTicket(ticketStableId);
  }

  @Post('v2/ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicketV2(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ) {
    return executeUberMutation(
      () => this.operations.retryOpsTicket(ticketStableId),
      { accepted: true },
    );
  }
}
