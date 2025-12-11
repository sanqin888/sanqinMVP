// apps/api/src/admin/menu/admin-menu.controller.ts

import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { AdminMenuService } from './admin-menu.service';

@Controller('admin/menu')
export class AdminMenuController {
  constructor(private readonly service: AdminMenuService) {}

  // 一次性拿到所有分类 + 菜品 + 选项，做后台展示
  @Get('full')
  async getFullMenu() {
    return this.service.getFullMenu();
  }

  // 新增 / 更新 分类
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

  // 新增 / 更新 菜品（不再有 description 字段）
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

  // 选项的上下架控制
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
}
