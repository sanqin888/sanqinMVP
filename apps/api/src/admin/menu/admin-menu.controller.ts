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
import {
  CatalogOffersMenuOrchestrationService,
  CatalogUberAvailabilityOrchestrationService,
} from '../../application/menu/public-api';
import {
  AdminMenuFullResponse,
  DailySpecialDto,
  TemplateGroupFullDto,
} from '@shared/menu';
import { CatalogAdminService } from '../../menu/public-api';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
@Controller('admin/menu')
export class AdminMenuController {
  constructor(
    private readonly catalog: CatalogAdminService,
    private readonly menuOffers: CatalogOffersMenuOrchestrationService,
    private readonly availability: CatalogUberAvailabilityOrchestrationService,
  ) {}

  @Get('full')
  async getFullMenu(): Promise<AdminMenuFullResponse> {
    return this.menuOffers.getFullMenu();
  }

  @Get('daily-specials')
  async getDailySpecials(
    @Query('weekday') weekday?: string,
  ): Promise<{ specials: DailySpecialDto[] }> {
    const parsedWeekday = weekday ? Number(weekday) : undefined;
    return this.menuOffers.getDailySpecials(
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
    return this.menuOffers.upsertDailySpecials(body);
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
    return this.catalog.createCategory(body);
  }

  @Put('categories/:categoryStableId')
  async updateCategory(
    @Param('categoryStableId') categoryStableId: string,
    @Body()
    body: {
      nameEn?: string;
      nameZh?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<{
    stableId: string;
    nameEn: string;
    nameZh: string | null;
    sortOrder: number;
    isActive: boolean;
  }> {
    return this.catalog.updateCategory(categoryStableId, body);
  }

  @Post('packaging-types')
  async createPackagingType(
    @Body()
    body: {
      name: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalog.createPackagingType(body);
  }

  @Put('packaging-types/:packagingTypeStableId')
  async updatePackagingType(
    @Param('packagingTypeStableId') packagingTypeStableId: string,
    @Body()
    body: {
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalog.updatePackagingType(packagingTypeStableId, body);
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
      isVisibleOnMainMenu?: boolean;
      publishToUberEats?: boolean;
      labelStrategy?: 'AUTO' | 'ALWAYS' | 'NEVER';
      itemKind?: 'FOOD' | 'BEVERAGE';
      packagingTypeStableIds?: string[];
      tempUnavailableUntil?: string | null;
    },
  ) {
    return this.catalog.createItem(body);
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
      isVisibleOnMainMenu?: boolean;
      publishToUberEats?: boolean;
      labelStrategy?: 'AUTO' | 'ALWAYS' | 'NEVER';
      itemKind?: 'FOOD' | 'BEVERAGE';
      packagingTypeStableIds?: string[];
      fixedComponents?: Array<{
        componentItemStableId: string;
        quantity: number;
        sortOrder?: number;
      }>;
      tempUnavailableUntil?: string | null;
    },
  ) {
    return this.availability.updateItem(itemStableId, body);
  }

  @Post('items/:itemStableId/availability')
  async setItemAvailability(
    @Param('itemStableId') itemStableId: string,
    @Body() body: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.availability.setItemAvailability(itemStableId, body.mode);
  }

  // ========== Option Group Templates ==========
  @Get('option-group-templates')
  async listTemplates(): Promise<TemplateGroupFullDto[]> {
    return this.catalog.listOptionGroupTemplates();
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
    return this.catalog.createOptionGroupTemplate(body);
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
    return this.catalog.updateOptionGroupTemplate(templateGroupStableId, body);
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
    return this.catalog.createTemplateOption(templateGroupStableId, body);
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
    return this.catalog.updateTemplateOption(optionStableId, body);
  }

  @Post('options/:optionStableId/availability')
  async setOptionAvailability(
    @Param('optionStableId') optionStableId: string,
    @Body() body: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.availability.setTemplateOptionAvailability(
      optionStableId,
      body.mode,
    );
  }

  // ✅ 软删除：不再物理删除（保证 stableId 永不复用）
  @Delete('options/:optionStableId')
  async deleteOption(@Param('optionStableId') optionStableId: string) {
    return this.catalog.deleteTemplateOption(optionStableId);
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
      /** Empty means the option affects every packaging used by the item. */
      affectedPackagingTypeStableIds?: string[];
    },
  ) {
    return this.catalog.bindTemplateGroupToItem(itemStableId, body);
  }

  @Delete('items/:itemStableId/option-group-bindings/:templateGroupStableId')
  async unbindTemplateGroupFromItem(
    @Param('itemStableId') itemStableId: string,
    @Param('templateGroupStableId') templateGroupStableId: string,
  ) {
    return this.catalog.unbindTemplateGroupFromItem(
      itemStableId,
      templateGroupStableId,
    );
  }
}
