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

  // ===== 下面是：选项组 & 选项 CRUD（使用 DB 字段 minSelect / maxSelect）=====

  /**
   * 新建选项组（挂在某个菜品下面）
   * 直接使用 DB 字段：minSelect / maxSelect / isActive
   */
  async createOptionGroup(dto: {
    itemId: string;
    nameEn: string;
    nameZh?: string;
    minSelect?: number | null;
    maxSelect?: number | null;
    sortOrder?: number;
  }): Promise<MenuOptionGroup> {
    if (!dto.itemId) {
      throw new BadRequestException('itemId is required');
    }

    const item = await this.prisma.menuItem.findUnique({
      where: { id: dto.itemId },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('item not found');
    }

    const nameEn = dto.nameEn?.trim();
    if (!nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    const nameZh = dto.nameZh?.trim() || null;
    const sortOrder =
      typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)
        ? dto.sortOrder
        : 0;

    let minSelect: number | null = null;
    if (typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)) {
      minSelect = dto.minSelect;
    } else if (dto.minSelect === null) {
      minSelect = null;
    }

    let maxSelect: number | null = null;
    if (typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)) {
      maxSelect = dto.maxSelect;
    } else if (dto.maxSelect === null) {
      maxSelect = null;
    }

    return this.prisma.menuOptionGroup.create({
      data: {
        itemId: dto.itemId,
        nameEn,
        nameZh,
        minSelect,
        maxSelect,
        isActive: true,
        sortOrder,
      },
    });
  }

  /**
   * 更新选项组
   */
  async updateOptionGroup(
    id: string,
    dto: Partial<{
      itemId: string;
      nameEn: string;
      nameZh?: string;
      minSelect: number | null;
      maxSelect: number | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<MenuOptionGroup> {
    const data: Partial<MenuOptionGroup> = {};

    if (typeof dto.itemId === 'string') {
      data.itemId = dto.itemId;
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

    if (typeof dto.minSelect === 'number' || dto.minSelect === null) {
      data.minSelect = dto.minSelect;
    }

    if (typeof dto.maxSelect === 'number' || dto.maxSelect === null) {
      data.maxSelect = dto.maxSelect;
    }

    if (typeof dto.sortOrder === 'number') {
      data.sortOrder = dto.sortOrder;
    }

    if (typeof dto.isActive === 'boolean') {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuOptionGroup.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('option group not found');
      }
      return existing;
    }

    try {
      return await this.prisma.menuOptionGroup.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('option group not found');
    }
  }

  /**
   * 删除选项组（连带删除该组选项）
   */
  async deleteOptionGroup(id: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.menuOption.deleteMany({
          where: { groupId: id },
        }),
        this.prisma.menuOptionGroup.delete({
          where: { id },
        }),
      ]);
      this.logger.log(`MenuOptionGroup deleted: id=${id}`);
    } catch {
      throw new NotFoundException('option group not found');
    }
  }

  /**
   * 在某个选项组下新建选项
   */
  async createOption(dto: {
    groupId: string;
    nameEn: string;
    nameZh?: string;
    priceDeltaCents?: number;
    sortOrder?: number;
  }): Promise<MenuOption> {
    if (!dto.groupId) {
      throw new BadRequestException('groupId is required');
    }

    const group = await this.prisma.menuOptionGroup.findUnique({
      where: { id: dto.groupId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('option group not found');
    }

    const nameEn = dto.nameEn?.trim();
    if (!nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    const nameZh = dto.nameZh?.trim() || null;

    let priceDeltaCents = 0;
    if (
      typeof dto.priceDeltaCents === 'number' &&
      Number.isFinite(dto.priceDeltaCents)
    ) {
      priceDeltaCents = Math.round(dto.priceDeltaCents);
    }

    const sortOrder =
      typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)
        ? dto.sortOrder
        : 0;

    return this.prisma.menuOption.create({
      data: {
        groupId: dto.groupId,
        nameEn,
        nameZh,
        priceDeltaCents,
        sortOrder,
        isAvailable: true,
        tempUnavailableUntil: null,
      },
    });
  }

  /**
   * 更新选项
   */
  async updateOption(
    id: string,
    dto: Partial<{
      groupId: string;
      nameEn: string;
      nameZh?: string;
      priceDeltaCents: number;
      sortOrder: number;
      isAvailable: boolean;
      tempUnavailableUntil: Date | null;
    }>,
  ): Promise<MenuOption> {
    const data: Partial<MenuOption> = {};

    if (typeof dto.groupId === 'string') {
      data.groupId = dto.groupId;
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

    if (
      typeof dto.priceDeltaCents === 'number' &&
      Number.isFinite(dto.priceDeltaCents)
    ) {
      data.priceDeltaCents = Math.round(dto.priceDeltaCents);
    }

    if (typeof dto.sortOrder === 'number') {
      data.sortOrder = dto.sortOrder;
    }

    if (typeof dto.isAvailable === 'boolean') {
      data.isAvailable = dto.isAvailable;
    }

    if (
      dto.tempUnavailableUntil === null ||
      dto.tempUnavailableUntil instanceof Date
    ) {
      if (dto.tempUnavailableUntil !== undefined) {
        data.tempUnavailableUntil = dto.tempUnavailableUntil;
      }
    }

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuOption.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('option not found');
      }
      return existing;
    }

    try {
      return await this.prisma.menuOption.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('option not found');
    }
  }

  /**
   * 删除选项
   */
  async deleteOption(id: string): Promise<void> {
    try {
      await this.prisma.menuOption.delete({
        where: { id },
      });
      this.logger.log(`MenuOption deleted: id=${id}`);
    } catch {
      throw new NotFoundException('option not found');
    }
  }
}
