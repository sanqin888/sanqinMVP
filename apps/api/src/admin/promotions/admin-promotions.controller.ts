import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  Channel,
  CouponStackingPolicy,
  PromotionRuleStatus,
  PromotionRuleType,
} from '@prisma/client';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminPromotionsService } from './admin-promotions.service';

type PromotionRuleBody = {
  stableId?: string;
  titleZh: string;
  titleEn?: string | null;
  description?: string | null;
  type: PromotionRuleType;
  status?: PromotionRuleStatus;
  priority?: number;
  stackingPolicy?: CouponStackingPolicy;
  excludesCoupons?: boolean;
  excludesItemPromotions?: boolean;
  channels?: Channel[];
  validFrom?: string | null;
  validTo?: string | null;
  weekdays?: number[];
  startMinutes?: number | null;
  endMinutes?: number | null;
  config: unknown;
};

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/promotions/rules')
export class AdminPromotionsController {
  constructor(private readonly service: AdminPromotionsService) {}

  @Get()
  listRules() {
    return this.service.listRules();
  }

  @Get(':stableId')
  getRule(@Param('stableId') stableId: string) {
    return this.service.getRule(stableId);
  }

  @Post()
  createRule(@Body() body: PromotionRuleBody) {
    return this.service.createRule(body);
  }

  @Put(':stableId')
  updateRule(
    @Param('stableId') stableId: string,
    @Body() body: PromotionRuleBody,
  ) {
    return this.service.updateRule(stableId, body);
  }

  @Delete(':stableId')
  deleteRule(@Param('stableId') stableId: string) {
    return this.service.deleteRule(stableId);
  }
}
