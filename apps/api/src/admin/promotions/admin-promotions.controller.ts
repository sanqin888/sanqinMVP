import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import {
  PROMOTION_RULE_MANAGEMENT,
  type PromotionRuleManagementInput,
  type PromotionRuleManagementPort,
} from '../../promotions/public-api';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/promotions/rules')
export class AdminPromotionsController {
  constructor(
    @Inject(PROMOTION_RULE_MANAGEMENT)
    private readonly management: PromotionRuleManagementPort,
  ) {}

  @Get()
  listRules() {
    return this.management.listRules();
  }

  @Get(':stableId')
  getRule(@Param('stableId') stableId: string) {
    return this.management.getRule(stableId);
  }

  @Post()
  createRule(@Body() body: PromotionRuleManagementInput) {
    return this.management.createRule(body);
  }

  @Put(':stableId')
  updateRule(
    @Param('stableId') stableId: string,
    @Body() body: PromotionRuleManagementInput,
  ) {
    return this.management.updateRule(stableId, body);
  }

  @Delete(':stableId')
  deleteRule(@Param('stableId') stableId: string) {
    return this.management.deleteRule(stableId);
  }
}
