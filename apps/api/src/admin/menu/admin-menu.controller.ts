// apps/api/src/admin/menu/admin-menu.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminMenuService } from './admin-menu.service';
import {
  AdminMenuFullResponse,
  DailySpecialDto,
  TemplateGroupFullDto,
} from '@shared/menu';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { PosDeviceGuard } from '../../pos/pos-device.guard';

@UseGuards(SessionAuthGuard, PosDeviceGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/menu')
export class AdminMenuController {
  constructor(private readonly service: AdminMenuService) {}

  @Get('full')
  async getFullMenu(): Promise<AdminMenuFullResponse> {
    return this.service.getFullMenu();
  }

  @Get('daily-specials')
  async getDailySpecials(
    @Query('weekday') weekday?: string,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const parsedWeekday = weekday ? Number(weekday) : undefined;
    return this.service.getDailySpecials(
      Number.isFinite(parsedWeekday) ? parsedWeekday : undefined,
    );
  }

  @Put('daily-specials/bulk')
  async upsertDailySpecials(
    @Body()
    body: {
      specials: Array<{
        stableId?: string | null;
        weekday: number;
        itemStableId: string;
        pricingMode: 'OVERRIDE_PRICE' | 'DISCOUNT_DELTA' | 'DISCOUNT_PERCENT';
        overridePriceCents?: number | null;
        discountDeltaCents?: number | null;
        discountPercent?: number | null;
        startDate?: string | null;
        endDate?: string | null;
        startMinutes?: number | null;
        endMinutes?: number | null;
        disallowCoupons?: boolean;
        isEnabled?: boolean;
        sortOrder?: number;
      }>;
    },
  ): Promise<{ specials: DailySpecialDto[] }> {
    return this.service.upsertDailySpecials(body);
  }

  @Post('categories')
  async createCategory(
    @Body()
    body: {
      nameEn: string;
      nameZh?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.createCategory(body);
  }

  @Put('categories/:categoryStableId')
  async setCategoryActive(
    @Param('categoryStableId') categoryStableId: string,
    @Body() body: { isActive: boolean },
  ): Promise<{ stableId: string; isActive: boolean }> {
    return this.service.setCategoryActive(categoryStableId, body.isActive);
  }

  @Post('items')
  async createItem(
    @Body()
    body: {
      categoryStableId: string;

      // ✅ 允许不传：不传则由 DB/Prisma 默认生成 cuid
      stableId?: string;

      nameEn: string;
      nameZh?: string;

      basePriceCents: number;
      sortOrder?: number;

      imageUrl?: string;
      ingredientsEn?: string;
      ingredientsZh?: string;

      isAvailable?: boolean;
      visibility?: 'PUBLIC' | 'HIDDEN';
      tempUnavailableUntil?: string | null;
    },
  ) {
    return this.service.createItem(body);
  }

  @Put('items/:itemStableId')
  async updateItem(
    @Param('itemStableId') itemStableId: string,
    @Body()
    body: {
      // 允许挪分类时使用；不挪则不传
      categoryStableId?: string;

      nameEn?: string;
      nameZh?: string | null;

      basePriceCents?: number;
      sortOrder?: number;

      imageUrl?: string | null;
      ingredientsEn?: string | null;
      ingredientsZh?: string | null;

      isAvailable?: boolean;
      visibility?: 'PUBLIC' | 'HIDDEN';
      tempUnavailableUntil?: string | null;
    },
  ) {
    return this.service.updateItem(itemStableId, body);
  }

  @Post('items/:itemStableId/availability')
  async setItemAvailability(
    @Param('itemStableId') itemStableId: string,
    @Body() body: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.service.setItemAvailability(itemStableId, body.mode);
  }

  // ========== Option Group Templates ==========
  @Get('option-group-templates')
  async listTemplates(): Promise<TemplateGroupFullDto[]> {
    return this.service.listOptionGroupTemplates();
  }

  @Post('option-group-templates')
  async createTemplateGroup(
    @Body()
    body: {
      nameEn: string;
      nameZh?: string;
      sortOrder?: number;
      defaultMinSelect?: number;
      defaultMaxSelect?: number | null;
    },
  ) {
    return this.service.createOptionGroupTemplate(body);
  }

  @Put('option-group-templates/:templateGroupStableId')
  async updateTemplateGroup(
    @Param('templateGroupStableId') templateGroupStableId: string,
    @Body()
    body: {
      nameEn?: string;
      nameZh?: string | null;
      sortOrder?: number;
      defaultMinSelect?: number;
      defaultMaxSelect?: number | null;
    },
  ) {
    return this.service.updateOptionGroupTemplate(templateGroupStableId, body);
  }

  @Post('option-group-templates/:templateGroupStableId/options')
  async createTemplateOption(
    @Param('templateGroupStableId') templateGroupStableId: string,
    @Body()
    body: {
      nameEn: string;
      nameZh?: string;
      priceDeltaCents?: number;
      sortOrder?: number;
      targetItemStableId?: string | null;
    },
  ) {
    return this.service.createTemplateOption(templateGroupStableId, body);
  }

  @Put('options/:optionStableId')
  async updateTemplateOption(
    @Param('optionStableId') optionStableId: string,
    @Body()
    body: {
      nameEn?: string;
      nameZh?: string | null;
      priceDeltaCents?: number;
      sortOrder?: number;
      childOptionStableIds?: string[];
      targetItemStableId?: string | null;
    },
  ) {
    return this.service.updateTemplateOption(optionStableId, body);
  }

  @Post('options/:optionStableId/availability')
  async setOptionAvailability(
    @Param('optionStableId') optionStableId: string,
    @Body() body: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.service.setTemplateOptionAvailability(
      optionStableId,
      body.mode,
    );
  }

  // ✅ 软删除：不再物理删除（保证 stableId 永不复用）
  @Delete('options/:optionStableId')
  async deleteOption(@Param('optionStableId') optionStableId: string) {
    return this.service.deleteTemplateOption(optionStableId);
  }

  // ========== Bindings (item <-> template group) ==========
  @Post('items/:itemStableId/option-group-bindings')
  async bindTemplateGroupToItem(
    @Param('itemStableId') itemStableId: string,
    @Body()
    body: {
      templateGroupStableId: string;
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;
    },
  ) {
    return this.service.bindTemplateGroupToItem(itemStableId, body);
  }

  @Delete('items/:itemStableId/option-group-bindings/:templateGroupStableId')
  async unbindTemplateGroupFromItem(
    @Param('itemStableId') itemStableId: string,
    @Param('templateGroupStableId') templateGroupStableId: string,
  ) {
    return this.service.unbindTemplateGroupFromItem(
      itemStableId,
      templateGroupStableId,
    );
  }
}
