// apps/api/src/admin/menu/admin-menu.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AdminMenuService } from './admin-menu.service';

@Controller('admin/menu')
export class AdminMenuController {
  constructor(private readonly service: AdminMenuService) {}

  // ========= 全量菜单（后台用） =========
  @Get('full')
  async getFullMenu() {
    return this.service.getFullMenu();
  }

  // ========= 选项组库（Template） =========

  @Get('option-group-templates')
  async listOptionGroupTemplates() {
    return this.service.listOptionGroupTemplates();
  }

  @Post('option-group-templates')
  async createOptionGroupTemplate(
    @Body() dto: { nameEn: string; nameZh?: string; sortOrder?: number; defaultMinSelect?: number; defaultMaxSelect?: number | null },
  ) {
    return this.service.createOptionGroupTemplate(dto);
  }

  @Put('option-group-templates/:id')
  async updateOptionGroupTemplate(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      sortOrder: number;
      defaultMinSelect: number;
      defaultMaxSelect: number | null;
    }>,
  ) {
    return this.service.updateOptionGroupTemplate(id, dto);
  }

  @Post('option-group-templates/:id/availability')
  async setOptionGroupTemplateAvailability(
    @Param('id') id: string,
    @Body() dto: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.service.setOptionGroupTemplateAvailability(id, dto.mode);
  }

  // 在某个“选项组库”下新建选项（模板选项）
  @Post('option-group-templates/:templateGroupId/options')
  async createTemplateOption(
    @Param('templateGroupId') templateGroupId: string,
    @Body()
    dto: { nameEn: string; nameZh?: string; priceDeltaCents?: number; sortOrder?: number },
  ) {
    return this.service.createTemplateOption({
      templateGroupId,
      ...dto,
    });
  }

  // ========= 分类 =========
  @Post('categories')
  async createCategory(
    @Body() dto: { nameEn: string; nameZh?: string; sortOrder?: number },
  ) {
    return this.service.createCategory(dto);
  }

  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return this.service.updateCategory(id, dto);
  }

  // ========= 菜品 =========
  @Post('items')
  async createItem(
    @Body()
    dto: {
      categoryId: string;
      stableId: string;
      nameEn: string;
      nameZh?: string;
      basePriceCents: number;
      sortOrder?: number;
      imageUrl?: string;
      ingredientsEn?: string;
      ingredientsZh?: string;
    },
  ) {
    return this.service.createItem(dto);
  }

  // 更新菜品（不再支持 descriptionEn/descriptionZh）
  @Put('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
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
    }>,
  ) {
    return this.service.updateItem(id, dto);
  }

  @Post('items/:id/availability')
  async setItemAvailability(
    @Param('id') id: string,
    @Body() dto: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.service.setItemAvailability(id, dto.mode);
  }

  // ========= 菜品-选项组绑定（原 option-groups CRUD，但语义变了） =========

  // 绑定一个“选项组库”到菜品
  @Post('items/:itemId/option-groups')
  async attachOptionGroup(
    @Param('itemId') itemId: string,
    @Body()
    dto: {
      templateGroupId: string;
      minSelect?: number | null;
      maxSelect?: number | null;
      sortOrder?: number;
      isEnabled?: boolean;
    },
  ) {
    return this.service.attachOptionGroup({
      itemId,
      ...dto,
    });
  }

  // 更新绑定（min/max/sort/isEnabled），也允许换绑到另一个模板组
  @Put('option-groups/:id')
  async updateAttachedOptionGroup(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      templateGroupId: string;
      minSelect: number | null;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;
    }>,
  ) {
    return this.service.updateAttachedOptionGroup(id, dto);
  }

  // 删除绑定（不会删模板组选项）
  @Delete('option-groups/:id')
  async detachOptionGroup(@Param('id') id: string) {
    await this.service.detachOptionGroup(id);
    return { success: true };
  }

  // ========= 模板选项（原 options CRUD，语义变为全局选项） =========
  @Put('options/:id')
  async updateTemplateOption(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      priceDeltaCents: number;
      sortOrder: number;
      isAvailable: boolean;
    }>,
  ) {
    return this.service.updateTemplateOption(id, dto);
  }

  @Delete('options/:id')
  async deleteTemplateOption(@Param('id') id: string) {
    await this.service.deleteTemplateOption(id);
    return { success: true };
  }

  @Post('options/:id/availability')
  async setTemplateOptionAvailability(
    @Param('id') id: string,
    @Body() dto: { mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF' },
  ) {
    return this.service.setTemplateOptionAvailability(id, dto.mode);
  }

  // ========= 选项组 CRUD ========= //

  // 在某个菜品下新建选项组
  @Post('items/:itemId/option-groups')
  async createOptionGroup(
    @Param('itemId') itemId: string,
    @Body()
    dto: {
      nameEn: string;
      nameZh?: string;
      isRequired?: boolean;
      maxChoices?: number | null;
      sortOrder?: number;
    },
  ) {
    return this.service.createOptionGroup({
      itemId,
      ...dto,
    });
  }

  @Put('option-groups/:id')
  async updateOptionGroup(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      itemId: string;
      nameEn: string;
      nameZh?: string;
      isRequired: boolean;
      maxChoices: number | null;
      sortOrder: number;
    }>,
  ) {
    return this.service.updateOptionGroup(id, dto);
  }

  @Delete('option-groups/:id')
  async deleteOptionGroup(@Param('id') id: string) {
    await this.service.deleteOptionGroup(id);
    return { success: true };
  }

  // ========= 选项 CRUD ========= //

  // 在某个选项组下新建选项
  @Post('option-groups/:groupId/options')
  async createOption(
    @Param('groupId') groupId: string,
    @Body()
    dto: {
      nameEn: string;
      nameZh?: string;
      priceDeltaCents?: number;
      sortOrder?: number;
      // 允许前端传，但当前前端没有传 isAvailable，默认即可
      isAvailable?: boolean;
    },
  ) {
    return this.service.createOption({
      groupId,
      ...dto,
    });
  }

  // 更新选项（支持 isAvailable，用于前端“可选”勾选框）
  @Put('options/:id')
  async updateOption(
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      groupId: string;
      nameEn: string;
      nameZh?: string;
      priceDeltaCents: number;
      sortOrder: number;
      isAvailable: boolean;
    }>,
  ) {
    return this.service.updateOption(id, dto);
  }

  @Delete('options/:id')
  async deleteOption(@Param('id') id: string) {
    await this.service.deleteOption(id);
    return { success: true };
  }
}
