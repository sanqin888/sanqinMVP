import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import { toUberListResponse } from '../contracts/responses/ubereats.responses';
import {
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import { SyncOrderStatusDto } from '../contracts/requests/ubereats.requests';
import { UberOrderApplication } from '../application/orders/uber-order.service';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsOrdersController {
  constructor(private readonly orders: UberOrderApplication) {}
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
