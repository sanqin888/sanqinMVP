import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import {
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import { SyncOrderStatusDto } from '../contracts/requests/ubereats.requests';
import {
  ListPendingUberOrdersQuery,
  SyncUberOrderStatusUseCase,
} from '../application/orders/uber-order.use-cases';
import {
  presentOrderMutation,
  presentOrderSummary,
  presentPendingOrders,
} from './orders.presenter';

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
    await this.statusSync.execute(externalOrderId, dto.status);
    return presentOrderMutation();
  }

  @Get('orders/pending')
  async listPendingOrders() {
    const result = await this.pendingOrders.list();
    return presentPendingOrders(result);
  }

  @Get('orders/pending/summary')
  async pendingOrdersSummary() {
    return presentOrderSummary(await this.pendingOrders.summary());
  }
}
