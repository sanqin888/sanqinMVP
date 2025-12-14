import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  AdminMenuService,
  type FullMenuResponseDto,
  type OptionGroupTemplateDto,
  type MenuOptionTemplateChoiceDto,
  type MenuCategoryDto,
  type MenuItemDto,
  type MenuItemOptionGroupDto,
  type SuccessResponseDto,
} from './admin-menu.service';

type CreateOptionGroupTemplateBodyDto = {
  nameEn: string;
  nameZh?: string;
  sortOrder?: number;
  defaultMinSelect?: number;
  defaultMaxSelect?: number | null;
};

type UpdateOptionGroupTemplateBodyDto = Partial<{
  nameEn: string;
  nameZh?: string;
  sortOrder: number;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
}>;

type SetAvailabilityBodyDto = {
  mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';
};

type CreateTemplateOptionBodyDto = {
  nameEn: string;
  nameZh?: string;
  priceDeltaCents?: number;
  sortOrder?: number;
};

type CreateCategoryBodyDto = {
  nameEn: string;
  nameZh?: string;
  sortOrder?: number;
};

type UpdateCategoryBodyDto = Partial<{
  nameEn: string;
  nameZh?: string;
  sortOrder: number;
  isActive: boolean;
}>;

type CreateItemBodyDto = {
  categoryId: string;
  stableId: string;
  nameEn: string;
  nameZh?: string;
  basePriceCents: number;
  sortOrder?: number;
  imageUrl?: string;
  ingredientsEn?: string;
  ingredientsZh?: string;
};

type UpdateItemBodyDto = Partial<{
  categoryId: string;
  nameEn: string;
  nameZh?: string;
  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  sortOrder: number;
  imageUrl?: string;
  ingredientsEn?: string;
  ingredientsZh?: string;
}>;

type AttachOptionGroupBodyDto = {
  templateGroupId: string;
  minSelect?: number | null;
  maxSelect?: number | null;
  sortOrder?: number;
  isEnabled?: boolean;
};

type UpdateAttachedOptionGroupBodyDto = Partial<{
  templateGroupId: string;
  minSelect: number | null;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;
}>;

type UpdateTemplateOptionBodyDto = Partial<{
  nameEn: string;
  nameZh?: string;
  priceDeltaCents: number;
  sortOrder: number;
  isAvailable: boolean;
}>;

@Controller('admin/menu')
export class AdminMenuController {
  constructor(private readonly service: AdminMenuService) {}

  // ========= 全量菜单（后台用） =========
  @Get('full')
  async getFullMenu(): Promise<FullMenuResponseDto> {
    return this.service.getFullMenu();
  }

  // ========= 选项组库（Template） =========
  @Get('option-group-templates')
  async listOptionGroupTemplates(): Promise<OptionGroupTemplateDto[]> {
    return this.service.listOptionGroupTemplates();
  }

  @Post('option-group-templates')
  async createOptionGroupTemplate(
    @Body() dto: CreateOptionGroupTemplateBodyDto,
  ): Promise<OptionGroupTemplateDto> {
    return this.service.createOptionGroupTemplate(dto);
  }

  @Put('option-group-templates/:id')
  async updateOptionGroupTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateOptionGroupTemplateBodyDto,
  ): Promise<OptionGroupTemplateDto> {
    return this.service.updateOptionGroupTemplate(id, dto);
  }

  @Post('option-group-templates/:id/availability')
  async setOptionGroupTemplateAvailability(
    @Param('id') id: string,
    @Body() dto: SetAvailabilityBodyDto,
  ): Promise<OptionGroupTemplateDto> {
    return this.service.setOptionGroupTemplateAvailability(id, dto.mode);
  }

  @Post('option-group-templates/:templateGroupId/options')
  async createTemplateOption(
    @Param('templateGroupId') templateGroupId: string,
    @Body() dto: CreateTemplateOptionBodyDto,
  ): Promise<MenuOptionTemplateChoiceDto> {
    return this.service.createTemplateOption({ templateGroupId, ...dto });
  }

  // ========= 分类 =========
  @Post('categories')
  async createCategory(
    @Body() dto: CreateCategoryBodyDto,
  ): Promise<MenuCategoryDto> {
    return this.service.createCategory(dto);
  }

  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryBodyDto,
  ): Promise<MenuCategoryDto> {
    return this.service.updateCategory(id, dto);
  }

  // ========= 菜品 =========
  @Post('items')
  async createItem(@Body() dto: CreateItemBodyDto): Promise<MenuItemDto> {
    return this.service.createItem(dto);
  }

  @Put('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateItemBodyDto,
  ): Promise<MenuItemDto> {
    return this.service.updateItem(id, dto);
  }

  @Post('items/:id/availability')
  async setItemAvailability(
    @Param('id') id: string,
    @Body() dto: SetAvailabilityBodyDto,
  ): Promise<MenuItemDto> {
    return this.service.setItemAvailability(id, dto.mode);
  }

  // ========= 菜品-选项组绑定 =========
  @Post('items/:itemId/option-groups')
  async attachOptionGroup(
    @Param('itemId') itemId: string,
    @Body() dto: AttachOptionGroupBodyDto,
  ): Promise<MenuItemOptionGroupDto> {
    return this.service.attachOptionGroup({ itemId, ...dto });
  }

  @Put('option-groups/:id')
  async updateAttachedOptionGroup(
    @Param('id') id: string,
    @Body() dto: UpdateAttachedOptionGroupBodyDto,
  ): Promise<MenuItemOptionGroupDto> {
    return this.service.updateAttachedOptionGroup(id, dto);
  }

  @Delete('option-groups/:id')
  async detachOptionGroup(
    @Param('id') id: string,
  ): Promise<SuccessResponseDto> {
    await this.service.detachOptionGroup(id);
    return { success: true };
  }

  // ========= 模板选项 =========
  @Put('options/:id')
  async updateTemplateOption(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateOptionBodyDto,
  ): Promise<MenuOptionTemplateChoiceDto> {
    return this.service.updateTemplateOption(id, dto);
  }

  @Delete('options/:id')
  async deleteTemplateOption(
    @Param('id') id: string,
  ): Promise<SuccessResponseDto> {
    await this.service.deleteTemplateOption(id);
    return { success: true };
  }

  @Post('options/:id/availability')
  async setTemplateOptionAvailability(
    @Param('id') id: string,
    @Body() dto: SetAvailabilityBodyDto,
  ): Promise<MenuOptionTemplateChoiceDto> {
    return this.service.setTemplateOptionAvailability(id, dto.mode);
  }
}
