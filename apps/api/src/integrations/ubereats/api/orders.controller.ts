import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import { toUberListResponse } from '../contracts/responses/ubereats.responses';
import {
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import { SyncOrderStatusDto } from '../contracts/requests/ubereats.requests';
import {
  ListPendingUberOrdersQuery,
  SyncUberOrderStatusUseCase,
} from '../application/orders/uber-order.use-cases';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsOrdersController {
  constructor(
    private readonly statusSync: SyncUberOrderStatusUseCase,
    private readonly pendingOrders: ListPendingUberOrdersQuery,
  ) {}
  @Post('orders/:externalOrderId/status')
  @UberMfaAdminWrite()
  async syncOrderStatus(
    @Param('externalOrderId', ResourceIdPipe) externalOrderId: string,
    @Body() dto: SyncOrderStatusDto,
  ) {
    return await this.statusSync.execute(externalOrderId, dto.status);
  }

  @Get('orders/pending')
  async listPendingOrders() {
    const result = await this.pendingOrders.list();
    return toUberListResponse(result.items, 100);
  }

  @Get('orders/pending/summary')
  async pendingOrdersSummary() {
    return this.pendingOrders.summary();
  }
}
