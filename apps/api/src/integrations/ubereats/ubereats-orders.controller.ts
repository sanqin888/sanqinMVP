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
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { SESSION_COOKIE_NAME } from '../../auth/session-auth.guard';
import { ResourceIdPipe } from './contracts/requests/resource-id.pipe';
import { toUberListResponse } from './contracts/responses/ubereats.responses';
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
  SyncOrderStatusDto,
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
import { UberOrderService } from './uber-order.service';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsOrdersController {
  private readonly logger = new AppLogger(UberEatsOrdersController.name);
  constructor(private readonly orders: UberOrderService) {}
  @Post('orders/:externalOrderId/status')
  @UberMfaAdminWrite()
  async syncOrderStatus(
    @Param('externalOrderId', ResourceIdPipe) externalOrderId: string,
    @Body() dto: SyncOrderStatusDto,
  ) {
    return await this.orders.syncOrderStatusToUber(externalOrderId, dto.status);
  }

  @Get('orders/pending')
  async listPendingOrders() {
    const result = await this.orders.listPendingUberOrders();
    return toUberListResponse(result.items, 100);
  }
}
