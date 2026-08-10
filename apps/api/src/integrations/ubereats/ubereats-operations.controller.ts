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

  @Get('reports/reconciliation')
  async listReconciliationReports(@Query() query: ReportListQuery) {
    return await this.operations.listReconciliationReports(
      query.storeId,
      query.limit,
    );
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
    return await this.operations.listOpsTickets(query.storeId, query.status);
  }

  @Post('ops/tickets/:ticketStableId/retry')
  @UberMfaAdminWrite()
  async retryOpsTicket(
    @Param('ticketStableId', ResourceIdPipe) ticketStableId: string,
  ): Promise<unknown> {
    return await this.operations.retryOpsTicket(ticketStableId);
  }
}
