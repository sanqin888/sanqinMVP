// apps/api/src/admin/menu/admin-menu.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MenuCategory,
  MenuItem,
  MenuItemOptionGroup,
  MenuOptionGroupTemplate,
  MenuOptionTemplateChoice,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';

type FullMenuResponse = (MenuCategory & {
  items: (MenuItem & {
    optionGroups: Array<{
      id: string; // 绑定 id（MenuItemOptionGroup.id）
      itemId: string;
      templateGroupId: string;

      // 绑定级配置
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;

      // 模板组信息（全局）
      nameEn: string;
      nameZh: string | null;
      templateIsAvailable: boolean;
      templateTempUnavailableUntil: Date | null;

      options: MenuOptionTemplateChoice[];
    }>;
  })[];
})[];

function endOfTodayLocal(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class AdminMenuService {
  private readonly logger = new AppLogger(AdminMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ========= 全量菜单（后台用） =========
  async getFullMenu(): Promise<FullMenuResponse> {
    const categories = await this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                templateGroup: {
                  include: {
                    options: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return categories.map((cat) => ({
      ...cat,
      items: cat.items.map((it) => ({
        ...it,
        optionGroups: (it.optionGroups ?? []).map((link) => ({
          id: link.id,
          itemId: link.itemId,
          templateGroupId: link.templateGroupId,
          minSelect: link.minSelect,
          maxSelect: link.maxSelect,
          sortOrder: link.sortOrder,
          isEnabled: link.isEnabled,
          nameEn: link.templateGroup.nameEn,
          nameZh: link.templateGroup.nameZh ?? null,
          templateIsAvailable: link.templateGroup.isAvailable,
          templateTempUnavailableUntil: link.templateGroup.tempUnavailableUntil ?? null,
          options: link.templateGroup.options ?? [],
        })),
      })),
    })) as FullMenuResponse;
  }

  // ========= 选项组库（Template） =========

  async listOptionGroupTemplates(): Promise<(MenuOptionGroupTemplate & { options: MenuOptionTemplateChoice[] })[]> {
    return this.prisma.menuOptionGroupTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async createOptionGroupTemplate(dto: {
    nameEn: string;
    nameZh?: string;
    sortOrder?: number;
    defaultMinSelect?: number;
    defaultMaxSelect?: number | null;
  }): Promise<MenuOptionGroupTemplate> {
    const nameEn = dto.nameEn?.trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const sortOrder = typeof dto.sortOrder === 'number' ? dto.sortOrder : 0;

    const defaultMinSelect =
      typeof dto.defaultMinSelect === 'number' && Number.isFinite(dto.defaultMinSelect)
        ? Math.max(0, Math.floor(dto.defaultMinSelect))
        : 0;

    const defaultMaxSelect =
      dto.defaultMaxSelect === null
        ? null
        : typeof dto.defaultMaxSelect === 'number' && Number.isFinite(dto.defaultMaxSelect)
        ? Math.max(0, Math.floor(dto.defaultMaxSelect))
        : 1;

    return this.prisma.menuOptionGroupTemplate.create({
      data: {
        nameEn,
        nameZh: dto.nameZh?.trim() || null,
        sortOrder,
        defaultMinSelect,
        defaultMaxSelect,
        isAvailable: true,
        tempUnavailableUntil: null,
      },
    });
  }

  async updateOptionGroupTemplate(
    id: string,
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      sortOrder: number;
      defaultMinSelect: number;
      defaultMaxSelect: number | null;
    }>,
  ): Promise<MenuOptionGroupTemplate> {
    const data: Partial<MenuOptionGroupTemplate> = {};

    if (typeof dto.nameEn === 'string') {
      const trimmed = dto.nameEn.trim();
      if (!trimmed) throw new BadRequestException('nameEn cannot be empty');
      data.nameEn = trimmed;
    }

    if (typeof dto.nameZh === 'string') {
      const trimmed = dto.nameZh.trim();
      data.nameZh = trimmed || null;
    }

    if (typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)) {
      data.sortOrder = dto.sortOrder;
    }

    if (typeof dto.defaultMinSelect === 'number' && Number.isFinite(dto.defaultMinSelect)) {
      data.defaultMinSelect = Math.max(0, Math.floor(dto.defaultMinSelect));
    }

    if (dto.defaultMaxSelect === null) {
      data.defaultMaxSelect = null;
    } else if (typeof dto.defaultMaxSelect === 'number' && Number.isFinite(dto.defaultMaxSelect)) {
      data.defaultMaxSelect = Math.max(0, Math.floor(dto.defaultMaxSelect));
    }

    try {
      return await this.prisma.menuOptionGroupTemplate.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('option group template not found');
    }
  }

  async setOptionGroupTemplateAvailability(
    id: string,
    mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF',
  ): Promise<MenuOptionGroupTemplate> {
    const now = new Date();
    let data: Partial<MenuOptionGroupTemplate>;

    if (mode === 'ON') {
      data = { isAvailable: true, tempUnavailableUntil: null };
    } else if (mode === 'PERMANENT_OFF') {
      data = { isAvailable: false, tempUnavailableUntil: null };
    } else {
      data = { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };
    }

    try {
      const group = await this.prisma.menuOptionGroupTemplate.update({
        where: { id },
        data,
      });
      this.logger.log(`MenuOptionGroupTemplate availability changed: id=${id} mode=${mode}`);
      return group;
    } catch {
      throw new NotFoundException('option group template not found');
    }
  }

  async createTemplateOption(dto: {
    templateGroupId: string;
    nameEn: string;
    nameZh?: string;
    priceDeltaCents?: number;
    sortOrder?: number;
  }): Promise<MenuOptionTemplateChoice> {
    if (!dto.templateGroupId) throw new BadRequestException('templateGroupId is required');

    const group = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { id: dto.templateGroupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('option group template not found');

    const nameEn = dto.nameEn?.trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const priceDeltaCents =
      typeof dto.priceDeltaCents === 'number' && Number.isFinite(dto.priceDeltaCents)
        ? Math.round(dto.priceDeltaCents)
        : 0;

    const sortOrder =
      typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder) ? dto.sortOrder : 0;

    return this.prisma.menuOptionTemplateChoice.create({
      data: {
        templateGroupId: dto.templateGroupId,
        nameEn,
        nameZh: dto.nameZh?.trim() || null,
        priceDeltaCents,
        sortOrder,
        isAvailable: true,
        tempUnavailableUntil: null,
      },
    });
  }

  // ========= 分类 =========
  async createCategory(dto?: {
    nameEn?: string;
    nameZh?: string;
    sortOrder?: number;
  }): Promise<MenuCategory> {
    const nameEn = dto?.nameEn?.trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const nameZh = dto?.nameZh?.trim() || null;
    const sortOrder = typeof dto?.sortOrder === 'number' ? dto.sortOrder : 0;

    return this.prisma.menuCategory.create({
      data: { nameEn, nameZh, sortOrder, isActive: true },
    });
  }

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
      if (!trimmed) throw new BadRequestException('nameEn cannot be empty');
      data.nameEn = trimmed;
    }

    if (typeof dto.nameZh === 'string') {
      const trimmed = dto.nameZh.trim();
      data.nameZh = trimmed || null;
    }

    if (typeof dto.sortOrder === 'number') data.sortOrder = dto.sortOrder;
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('category not found');
      return existing;
    }

    try {
      return await this.prisma.menuCategory.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('category not found');
    }
  }

  // ========= 菜品 =========
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
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');

    const stableId = dto.stableId?.trim();
    if (!stableId) throw new BadRequestException('stableId is required');

    const nameEn = dto.nameEn?.trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    if (typeof dto.basePriceCents !== 'number' || !Number.isFinite(dto.basePriceCents)) {
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
        tempUnavailableUntil: null,
      },
    });
  }

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

    if (typeof dto.categoryId === 'string') data.categoryId = dto.categoryId;

    if (typeof dto.nameEn === 'string') {
      const trimmed = dto.nameEn.trim();
      if (!trimmed) throw new BadRequestException('nameEn cannot be empty');
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

    if (typeof dto.basePriceCents === 'number' && Number.isFinite(dto.basePriceCents)) {
      data.basePriceCents = Math.round(dto.basePriceCents);
    }

    if (typeof dto.isAvailable === 'boolean') data.isAvailable = dto.isAvailable;
    if (typeof dto.isVisible === 'boolean') data.isVisible = dto.isVisible;
    if (typeof dto.sortOrder === 'number') data.sortOrder = dto.sortOrder;

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuItem.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('item not found');
      return existing;
    }

    try {
      return await this.prisma.menuItem.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  async setItemAvailability(
    id: string,
    mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF',
  ): Promise<MenuItem> {
    const now = new Date();
    let data: Partial<MenuItem>;

    if (mode === 'ON') {
      data = { isAvailable: true, tempUnavailableUntil: null };
    } else if (mode === 'PERMANENT_OFF') {
      data = { isAvailable: false, tempUnavailableUntil: null };
    } else {
      data = { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };
    }

    try {
      const item = await this.prisma.menuItem.update({ where: { id }, data });
      this.logger.log(`MenuItem availability changed: id=${id} mode=${mode}`);
      return item;
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  // ========= 菜品绑定（Attach / Update / Detach） =========
  async attachOptionGroup(dto: {
    itemId: string;
    templateGroupId: string;
    minSelect?: number | null;
    maxSelect?: number | null;
    sortOrder?: number;
    isEnabled?: boolean;
  }): Promise<MenuItemOptionGroup> {
    if (!dto.itemId) throw new BadRequestException('itemId is required');
    if (!dto.templateGroupId) throw new BadRequestException('templateGroupId is required');

    const item = await this.prisma.menuItem.findUnique({
      where: { id: dto.itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('item not found');

    const tmpl = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { id: dto.templateGroupId },
      select: { id: true, defaultMinSelect: true, defaultMaxSelect: true },
    });
    if (!tmpl) throw new NotFoundException('option group template not found');

    const minSelect =
      typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)
        ? Math.max(0, Math.floor(dto.minSelect))
        : tmpl.defaultMinSelect;

    const maxSelect =
      dto.maxSelect === null
        ? null
        : typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)
        ? Math.max(0, Math.floor(dto.maxSelect))
        : tmpl.defaultMaxSelect;

    const sortOrder =
      typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder) ? dto.sortOrder : 0;

    const isEnabled = typeof dto.isEnabled === 'boolean' ? dto.isEnabled : true;

    try {
      return await this.prisma.menuItemOptionGroup.create({
        data: {
          itemId: dto.itemId,
          templateGroupId: dto.templateGroupId,
          minSelect,
          maxSelect,
          sortOrder,
          isEnabled,
        },
      });
    } catch {
      // 可能撞上 @@unique(itemId, templateGroupId)
      throw new BadRequestException('this template group is already attached to the item');
    }
  }

  async updateAttachedOptionGroup(
    id: string,
    dto: Partial<{
      templateGroupId: string;
      minSelect: number | null;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;
    }>,
  ): Promise<MenuItemOptionGroup> {
    const data: Partial<MenuItemOptionGroup> = {};

    if (typeof dto.templateGroupId === 'string') data.templateGroupId = dto.templateGroupId;
    if (typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)) data.sortOrder = dto.sortOrder;
    if (typeof dto.isEnabled === 'boolean') data.isEnabled = dto.isEnabled;

    if (dto.minSelect === null) data.minSelect = 0;
    else if (typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)) data.minSelect = Math.max(0, Math.floor(dto.minSelect));

    if (dto.maxSelect === null) data.maxSelect = null;
    else if (typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)) data.maxSelect = Math.max(0, Math.floor(dto.maxSelect));

    try {
      return await this.prisma.menuItemOptionGroup.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('attached option group not found');
    }
  }

  async detachOptionGroup(id: string): Promise<void> {
    try {
      await this.prisma.menuItemOptionGroup.delete({ where: { id } });
      this.logger.log(`MenuItemOptionGroup detached: id=${id}`);
    } catch {
      throw new NotFoundException('attached option group not found');
    }
  }

  // ========= 模板选项（全局） =========
  async updateTemplateOption(
    id: string,
    dto: Partial<{
      nameEn: string;
      nameZh?: string;
      priceDeltaCents: number;
      sortOrder: number;
      isAvailable: boolean;
    }>,
  ): Promise<MenuOptionTemplateChoice> {
    const data: Partial<MenuOptionTemplateChoice> = {};

    if (typeof dto.nameEn === 'string') {
      const trimmed = dto.nameEn.trim();
      if (!trimmed) throw new BadRequestException('nameEn cannot be empty');
      data.nameEn = trimmed;
    }

    if (typeof dto.nameZh === 'string') {
      const trimmed = dto.nameZh.trim();
      data.nameZh = trimmed || null;
    }

    if (typeof dto.priceDeltaCents === 'number' && Number.isFinite(dto.priceDeltaCents)) {
      data.priceDeltaCents = Math.round(dto.priceDeltaCents);
    }

    if (typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)) {
      data.sortOrder = dto.sortOrder;
    }

    if (typeof dto.isAvailable === 'boolean') data.isAvailable = dto.isAvailable;

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuOptionTemplateChoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('option not found');
      return existing;
    }

    try {
      return await this.prisma.menuOptionTemplateChoice.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('option not found');
    }
  }

  async deleteTemplateOption(id: string): Promise<void> {
    try {
      await this.prisma.menuOptionTemplateChoice.delete({ where: { id } });
      this.logger.log(`MenuOptionTemplateChoice deleted: id=${id}`);
    } catch {
      throw new NotFoundException('option not found');
    }
  }

  async setTemplateOptionAvailability(
    id: string,
    mode: 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF',
  ): Promise<MenuOptionTemplateChoice> {
    const now = new Date();
    let data: Partial<MenuOptionTemplateChoice>;

    if (mode === 'ON') {
      data = { isAvailable: true, tempUnavailableUntil: null };
    } else if (mode === 'PERMANENT_OFF') {
      data = { isAvailable: false, tempUnavailableUntil: null };
    } else {
      data = { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };
    }

    try {
      const option = await this.prisma.menuOptionTemplateChoice.update({
        where: { id },
        data,
      });
      this.logger.log(`MenuOptionTemplateChoice availability changed: id=${id} mode=${mode}`);
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

    let minSelect: number | undefined;
    if (typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)) {
      minSelect = dto.minSelect;
    }

    let maxSelect: number | undefined;
    if (typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)) {
      maxSelect = dto.maxSelect;
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

    if (typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)) {
      data.minSelect = dto.minSelect;
    }

    if (typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)) {
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
