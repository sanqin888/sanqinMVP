import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AppLogger } from '../../../common/app-logger';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import { toUberListResponse } from '../contracts/responses/ubereats.responses';
import {
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import { SyncOrderStatusDto } from '../contracts/requests/ubereats.requests';
import { UberOrderService } from '../application/orders/uber-order.service';

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

  @Get('orders/pending/summary')
  async pendingOrdersSummary() {
    return this.orders.getPendingUberOrdersSummary();
  }
}
