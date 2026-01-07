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
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Prisma } from '@prisma/client';
import { AdminCouponsService } from './admin-coupons.service';

type CouponTemplatePayload = {
  couponStableId?: string;
  name: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  validFrom?: string | null;
  validTo?: string | null;
  useRule: Prisma.InputJsonValue;
  issueRule?: Prisma.InputJsonValue | null;
};

type CouponProgramPayload = {
  programStableId?: string;
  name: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  distributionType?:
    | 'AUTOMATIC_TRIGGER'
    | 'MANUAL_CLAIM'
    | 'PROMO_CODE'
    | 'ADMIN_PUSH';
  triggerType?: 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED' | null;
  validFrom?: string | null;
  validTo?: string | null;
  promoCode?: string | null;
  totalLimit?: number | null;
  perUserLimit?: number | null;
  eligibility?: Prisma.InputJsonValue | null;
  items: Prisma.InputJsonValue;
};

@UseGuards(SessionAuthGuard, RolesGuard)
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
}
