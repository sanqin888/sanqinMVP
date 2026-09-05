import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminMfaGuard,
  Roles,
  RolesGuard,
  SessionAuthGuard,
} from '../auth/public-api';
import {
  CUSTOMER_EXISTENCE_READER,
  type CustomerExistenceReaderPort,
} from '../membership/public-api';
import { AdminMemberOrdersReadService } from './admin-member-orders-read.service';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/members')
export class AdminMemberOrdersController {
  constructor(
    private readonly ordersRead: AdminMemberOrdersReadService,
    @Inject(CUSTOMER_EXISTENCE_READER)
    private readonly customerExistence: CustomerExistenceReaderPort,
  ) {}

  private async requireExistingCustomer(userStableId: string): Promise<string> {
    const stable = userStableId.trim();
    if (!stable) {
      throw new BadRequestException('userStableId is required');
    }
    if (!(await this.customerExistence.customerExists(stable))) {
      throw new NotFoundException('member not found');
    }
    return stable;
  }

  @Get(':userStableId/orders')
  async listOrders(
    @Param('userStableId') userStableId: string,
    @Query('limit') limitRaw?: string,
  ) {
    return this.ordersRead.listOrders(
      await this.requireExistingCustomer(userStableId),
      limitRaw,
    );
  }

  @Get(':userStableId/top-items')
  async listTopPurchasedItems(
    @Param('userStableId') userStableId: string,
    @Query('limit') limitRaw?: string,
  ) {
    return this.ordersRead.listTopPurchasedItems(
      await this.requireExistingCustomer(userStableId),
      limitRaw,
    );
  }
}
