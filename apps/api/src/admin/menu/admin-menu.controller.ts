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

  /**
   * 一次性拿到所有分类 + 菜品 + 选项（后台用）
   */
  @Get('full')
  async getFullMenu() {
    return this.service.getFullMenu();
  }

  // ========= 分类 ========= //

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

  // ========= 菜品 ========= //

  // 新增菜品（已移除 description 字段）
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

  // 设置菜品上下架（永久 / 当天 / 恢复）
  @Post('items/:id/availability')
  async setItemAvailability(
    @Param('id') id: string,
    @Body()
    dto: {
      mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';
    },
  ) {
    return this.service.setItemAvailability(id, dto.mode);
  }

  // ========= 选项上下架（保留给别的入口用） ========= //

  @Post('options/:id/availability')
  async setOptionAvailability(
    @Param('id') id: string,
    @Body()
    dto: {
      mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';
    },
  ) {
    return this.service.setOptionAvailability(id, dto.mode);
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
