// apps/api/src/admin/coupons/admin-coupons.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type {
  CouponProgramAdminInput,
  CouponTemplateAdminInput,
} from '../../coupons/public-api';
import { AdminCouponsService } from './admin-coupons.service';

type CouponTemplatePayload = CouponTemplateAdminInput;
type CouponProgramPayload = CouponProgramAdminInput;

type IssueProgramPayload = {
  userStableId?: string;
  phone?: string;
};

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly service: AdminCouponsService) {}

  @Get('templates')
  async listTemplates() {
    return this.service.listTemplates();
  }

  @Get('templates/:couponStableId')
  async getTemplate(@Param('couponStableId') couponStableId: string) {
    return this.service.getTemplate(couponStableId);
  }

  @Post('templates')
  async createTemplate(@Body() body: CouponTemplatePayload) {
    return this.service.createTemplate(body);
  }

  @Put('templates/:couponStableId')
  async updateTemplate(
    @Param('couponStableId') couponStableId: string,
    @Body() body: CouponTemplatePayload,
  ) {
    return this.service.updateTemplate(couponStableId, body);
  }

  @Get('programs')
  async listPrograms() {
    return this.service.listPrograms();
  }

  @Get('programs/:programStableId')
  async getProgram(@Param('programStableId') programStableId: string) {
    return this.service.getProgram(programStableId);
  }

  @Post('programs')
  async createProgram(@Body() body: CouponProgramPayload) {
    return this.service.createProgram(body);
  }

  @Put('programs/:programStableId')
  async updateProgram(
    @Param('programStableId') programStableId: string,
    @Body() body: CouponProgramPayload,
  ) {
    return this.service.updateProgram(programStableId, body);
  }

  @Post('programs/:programStableId/issue')
  async issueProgram(
    @Param('programStableId') programStableId: string,
    @Body() body: IssueProgramPayload,
  ) {
    return this.service.issueProgram(programStableId, body);
  }
}
