// apps/api/src/admin/menu/admin-menu.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MenuCategory,
  MenuItem,
  MenuOption,
  MenuOptionGroup,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';

export type FullMenu = (MenuCategory & {
  items: (MenuItem & {
    optionGroups: (MenuOptionGroup & {
      options: MenuOption[];
    })[];
  })[];
})[];

@Injectable()
export class AdminMenuService {
  private readonly logger = new AppLogger(AdminMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 后台用：一次性拿到所有分类 + 菜品 + 选项
   */
  async getFullMenu(): Promise<FullMenu> {
    const categories = await this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                options: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return categories;
  }

  /**
   * 新建分类
   */
  async createCategory(dto?: {
    nameEn?: string;
    nameZh?: string;
    sortOrder?: number;
  }): Promise<MenuCategory> {
    const nameEn = dto?.nameEn?.trim();
    if (!nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    const nameZh = dto?.nameZh?.trim() || null;
    const sortOrder = typeof dto?.sortOrder === 'number' ? dto.sortOrder : 0;

    return this.prisma.menuCategory.create({
      data: {
        nameEn,
        nameZh,
        sortOrder,
        isActive: true,
      },
    });
  }

  /**
   * 更新分类
   */
  async updateCategory(
    id: string,
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<MenuCategory> {
    const data: Partial<MenuCategory> = {};

    if (typeof dto.nameEn === 'string') {
      const trimmed = dto.nameEn.trim();
      if (!trimmed) {
        throw new BadRequestException('nameEn cannot be empty');
      }
      data.nameEn = trimmed;
    }

    if (typeof dto.nameZh === 'string') {
      const trimmed = dto.nameZh.trim();
      data.nameZh = trimmed || null;
    }

    if (typeof dto.sortOrder === 'number') {
      data.sortOrder = dto.sortOrder;
    }

    if (typeof dto.isActive === 'boolean') {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuCategory.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('category not found');
      }
      return existing;
    }

    try {
      return await this.prisma.menuCategory.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('category not found');
    }
  }

  /**
   * 新建菜品（不再接收 description）
   */
  async createItem(dto: {
    categoryId: string;
    stableId: string;
    nameEn: string;
    nameZh?: string;
    basePriceCents: number;
    sortOrder?: number;
    imageUrl?: string;
    ingredientsEn?: string;
    ingredientsZh?: string;
  }): Promise<MenuItem> {
    if (!dto.categoryId) {
      throw new BadRequestException('categoryId is required');
    }

    const stableId = dto.stableId?.trim();
    if (!stableId) {
      throw new BadRequestException('stableId is required');
    }

    const nameEn = dto.nameEn?.trim();
    if (!nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    if (
      typeof dto.basePriceCents !== 'number' ||
      !Number.isFinite(dto.basePriceCents)
    ) {
      throw new BadRequestException('basePriceCents must be a finite number');
    }

    return this.prisma.menuItem.create({
      data: {
        categoryId: dto.categoryId,
        stableId,
        nameEn,
        nameZh: dto.nameZh?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        ingredientsEn: dto.ingredientsEn?.trim() || null,
        ingredientsZh: dto.ingredientsZh?.trim() || null,
        basePriceCents: Math.round(dto.basePriceCents),
        sortOrder: dto.sortOrder ?? 0,
        isAvailable: true,
        isVisible: true,
      },
    });
  }

  /**
   * 更新菜品（不再支持 descriptionEn/descriptionZh）
   */
  async updateItem(
    id: string,
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
  ): Promise<MenuItem> {
    const data: Partial<MenuItem> = {};

    if (typeof dto.categoryId === 'string') {
      data.categoryId = dto.categoryId;
    }

    if (typeof dto.nameEn === 'string') {
      const trimmed = dto.nameEn.trim();
      if (!trimmed) {
        throw new BadRequestException('nameEn cannot be empty');
      }
      data.nameEn = trimmed;
    }

    if (typeof dto.nameZh === 'string') {
      const trimmed = dto.nameZh.trim();
      data.nameZh = trimmed || null;
    }

    if (typeof dto.imageUrl === 'string') {
      const trimmed = dto.imageUrl.trim();
      data.imageUrl = trimmed || null;
    }

    if (typeof dto.ingredientsEn === 'string') {
      const trimmed = dto.ingredientsEn.trim();
      data.ingredientsEn = trimmed || null;
    }

    if (typeof dto.ingredientsZh === 'string') {
      const trimmed = dto.ingredientsZh.trim();
      data.ingredientsZh = trimmed || null;
    }

    if (
      typeof dto.basePriceCents === 'number' &&
      Number.isFinite(dto.basePriceCents)
    ) {
      data.basePriceCents = Math.round(dto.basePriceCents);
    }

    if (typeof dto.isAvailable === 'boolean') {
      data.isAvailable = dto.isAvailable;
    }

    if (typeof dto.isVisible === 'boolean') {
      data.isVisible = dto.isVisible;
    }

    if (typeof dto.sortOrder === 'number') {
      data.sortOrder = dto.sortOrder;
    }

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuItem.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('item not found');
      }
      return existing;
    }

    try {
      return await this.prisma.menuItem.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  /**
   * 菜品上下架（全局生效：web + POS）
   */
  async setItemAvailability(
    id: string,
    mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF',
  ): Promise<MenuItem> {
    const now = new Date();
    let data: Partial<MenuItem>;

    if (mode === 'ON') {
      data = {
        isAvailable: true,
        tempUnavailableUntil: null,
      };
    } else if (mode === 'PERMANENT_OFF') {
      data = {
        isAvailable: false,
        tempUnavailableUntil: null,
      };
    } else {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      data = {
        isAvailable: true,
        tempUnavailableUntil: endOfDay,
      };
    }

    try {
      const item = await this.prisma.menuItem.update({
        where: { id },
        data,
      });
      this.logger.log(`MenuItem availability changed: id=${id} mode=${mode}`);
      return item;
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  /**
   * 选项上下架（全局生效：web + POS）
   */
  async setOptionAvailability(
    id: string,
    mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF',
  ): Promise<MenuOption> {
    const now = new Date();
    let data: Partial<MenuOption>;

    if (mode === 'ON') {
      data = {
        isAvailable: true,
        tempUnavailableUntil: null,
      } as Partial<MenuOption>;
    } else if (mode === 'PERMANENT_OFF') {
      data = {
        isAvailable: false,
        tempUnavailableUntil: null,
      } as Partial<MenuOption>;
    } else {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      data = {
        isAvailable: true,
        tempUnavailableUntil: endOfDay as unknown as Date,
      } as Partial<MenuOption>;
    }

    try {
      const option = await this.prisma.menuOption.update({
        where: { id },
        data,
      });
      this.logger.log(`MenuOption availability changed: id=${id} mode=${mode}`);
      return option;
    } catch {
      throw new NotFoundException('option not found');
    }
  }
}
