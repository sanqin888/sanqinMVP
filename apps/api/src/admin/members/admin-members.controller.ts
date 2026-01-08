// apps/api/src/admin/members/admin-members.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { AdminMembersService } from './admin-members.service';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/members')
export class AdminMembersController {
  constructor(private readonly service: AdminMembersService) {}

  @Get()
  async listMembers(
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
    @Query('registeredFrom') registeredFrom?: string,
    @Query('registeredTo') registeredTo?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    return this.service.listMembers({
      search,
      tier,
      status,
      registeredFrom,
      registeredTo,
      page: pageRaw,
      pageSize: pageSizeRaw,
    });
  }

  @Get(':userStableId')
  async getMemberDetail(@Param('userStableId') userStableId: string) {
    return this.service.getMemberDetail(userStableId);
  }

  @Get(':userStableId/loyalty-ledger')
  async getLoyaltyLedger(
    @Param('userStableId') userStableId: string,
    @Query('limit') limitRaw?: string,
  ) {
    return this.service.getLoyaltyLedger(userStableId, limitRaw);
  }

  @Get(':userStableId/orders')
  async listOrders(
    @Param('userStableId') userStableId: string,
    @Query('limit') limitRaw?: string,
  ) {
    return this.service.listOrders(userStableId, limitRaw);
  }

  @Get(':userStableId/coupons')
  async listCoupons(@Param('userStableId') userStableId: string) {
    return this.service.listCoupons(userStableId);
  }

  @Post(':userStableId/issue-coupon')
  async issueCoupon(
    @Param('userStableId') userStableId: string,
    @Body()
    body: {
      couponTemplateStableId?: string;
      note?: string;
    },
  ) {
    return this.service.issueCoupon(userStableId, body);
  }

  @Get(':userStableId/addresses')
  async listAddresses(@Param('userStableId') userStableId: string) {
    return this.service.listAddresses(userStableId);
  }

  @Get(':userStableId/devices')
  async getDeviceManagement(@Param('userStableId') userStableId: string) {
    return this.service.getDeviceManagement(userStableId);
  }

  @Delete(':userStableId/devices/sessions/:sessionId')
  async revokeSession(
    @Param('userStableId') userStableId: string,
    @Param('sessionId') sessionId: string,
  ) {
    await this.service.revokeSession(userStableId, sessionId);
    return { success: true };
  }

  @Delete(':userStableId/devices/trusted/:deviceId')
  async revokeTrustedDevice(
    @Param('userStableId') userStableId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.service.revokeTrustedDevice(userStableId, deviceId);
    return { success: true };
  }

  @Patch(':userStableId')
  async updateMember(
    @Param('userStableId') userStableId: string,
    @Body()
    body: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      birthdayMonth?: number | null;
      birthdayDay?: number | null;
    },
  ) {
    return this.service.updateMember(userStableId, body);
  }

  @Post(':userStableId/adjust-points')
  async adjustPoints(
    @Param('userStableId') userStableId: string,
    @Body()
    body: {
      deltaPoints?: number;
      idempotencyKey?: string;
      note?: string;
    },
  ) {
    return this.service.adjustPoints(userStableId, body);
  }

  @Post(':userStableId/ban')
  async banMember(
    @Param('userStableId') userStableId: string,
    @Body()
    body: {
      disabled?: boolean;
    },
  ) {
    return this.service.setMemberStatus(userStableId, body?.disabled ?? true);
  }
}
