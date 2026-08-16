import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  BusinessScheduleRepository,
  ItemChannelConfigRepository,
  MenuSnapshotRepository,
  MenuStoreMappingRepository,
  ModifierConfigRepository,
  UberMenuRepositoryScope,
  UberMenuUnitOfWork,
} from '../../application/menu/uber-menu-repositories.ports';
import type { UberMenuDraftSource } from '../../domain/menu/uber-menu-draft-source';

type MenuDb = PrismaService | Prisma.TransactionClient;

/** Owns the Prisma query shape and maps it to the domain graph snapshot. */
export class UberMenuDraftSourcePrismaRepository {
  constructor(private readonly db: MenuDb) {}

  async load(
    storeId: string,
    uberStoreId: string,
  ): Promise<UberMenuDraftSource> {
    const [
      categories,
      menuItems,
      modifierTemplates,
      itemConfigs,
      optionConfigs,
      modifierConfigs,
      categoryConfigs,
    ] = await Promise.all([
      this.db.menuCategory.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          stableId: true,
          nameEn: true,
          nameZh: true,
          sortOrder: true,
          isActive: true,
        },
      }),
      this.db.menuItem.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishToUberEats: true,
        },
        select: {
          id: true,
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          sortOrder: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            where: { isEnabled: true },
            select: {
              templateGroup: { select: { stableId: true } },
              sortOrder: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.db.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null },
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          isAvailable: true,
          sortOrder: true,
          options: {
            where: { deletedAt: null },
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              isAvailable: true,
              sortOrder: true,
              childLinks: {
                select: {
                  childOption: {
                    select: { templateGroup: { select: { stableId: true } } },
                  },
                },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.db.uberItemChannelConfig.findMany({
        where: { storeId },
        select: {
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.db.uberOptionItemConfig.findMany({
        where: { storeId },
        select: {
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.db.uberModifierGroupConfig.findMany({
        where: { storeId },
        select: {
          templateGroupStableId: true,
          displayName: true,
          minSelect: true,
          maxSelect: true,
          isActive: true,
        },
      }),
      this.db.uberCategoryConfig.findMany({
        where: { storeId },
        select: {
          menuCategoryStableId: true,
          displayName: true,
          sortOrder: true,
          isActive: true,
        },
      }),
    ]);

    return {
      storeId,
      uberStoreId,
      categories,
      menuItems: menuItems.map(({ optionGroups, ...item }) => ({
        ...item,
        optionGroups: optionGroups.map((link) => ({
          templateGroupStableId: link.templateGroup.stableId,
          sortOrder: link.sortOrder,
        })),
      })),
      modifierTemplates: modifierTemplates.map(({ options, ...template }) => ({
        ...template,
        options: options.map(({ childLinks, ...option }) => ({
          ...option,
          childTemplateGroupStableIds: childLinks.map(
            (link) => link.childOption.templateGroup.stableId,
          ),
        })),
      })),
      itemConfigs,
      optionConfigs,
      modifierConfigs,
      categoryConfigs,
    };
  }
}
const object = (value: unknown) =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null;
export const readStoreTimezone = (raw: unknown): string | null => {
  const row = object(raw);
  const location = object(row?.location);
  return (
    string(row?.timezone) ??
    string(row?.time_zone) ??
    string(location?.timezone) ??
    string(location?.time_zone)
  );
};

export class UberMenuSnapshotPrismaRepository implements MenuSnapshotRepository {
  constructor(private readonly db: MenuDb) {}
  async load() {
    const [categories, items] = await Promise.all([
      this.db.menuCategory.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { stableId: true, nameEn: true, sortOrder: true },
      }),
      this.db.menuItem.findMany({
        where: { deletedAt: null, publishToUberEats: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          nameEn: true,
          basePriceCents: true,
          isAvailable: true,
          category: { select: { stableId: true } },
        },
      }),
    ]);
    return {
      categories: categories.map((row) => ({
        stableId: row.stableId,
        name: row.nameEn,
        sortOrder: row.sortOrder,
      })),
      items: items.map((row) => ({
        stableId: row.stableId,
        categoryStableId: row.category.stableId,
        name: row.nameEn,
        priceCents: row.basePriceCents,
        isAvailable: row.isAvailable,
      })),
    };
  }
}
export class UberItemChannelConfigPrismaRepository implements ItemChannelConfigRepository {
  constructor(private readonly db: MenuDb) {}
  async list(storeId: string) {
    const rows = await this.db.uberItemChannelConfig.findMany({
      where: { storeId },
      select: {
        storeId: true,
        menuItemStableId: true,
        priceCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      stableId: row.menuItemStableId,
      priceCents: row.priceCents,
      isAvailable: row.isAvailable,
      displayName: row.displayName,
      displayDescription: row.displayDescription,
    }));
  }
}
export class UberModifierConfigPrismaRepository implements ModifierConfigRepository {
  constructor(private readonly db: MenuDb) {}
  async list(storeId: string) {
    const rows = await this.db.uberModifierGroupConfig.findMany({
      where: { storeId },
      select: {
        storeId: true,
        templateGroupStableId: true,
        displayName: true,
        minSelect: true,
        maxSelect: true,
        isActive: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      stableId: row.templateGroupStableId,
      displayName: row.displayName,
      minSelect: row.minSelect,
      maxSelect: row.maxSelect,
      isActive: row.isActive,
    }));
  }
}
export class UberBusinessSchedulePrismaRepository implements BusinessScheduleRepository {
  constructor(private readonly db: MenuDb) {}
  async get() {
    const [config, rows] = await Promise.all([
      this.db.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.db.businessHour.findMany({
        orderBy: { weekday: 'asc' },
        select: {
          weekday: true,
          openMinutes: true,
          closeMinutes: true,
          isClosed: true,
        },
      }),
    ]);
    return {
      timezone: config?.timezone ?? null,
      salesTaxRate: config?.salesTaxRate ?? null,
      hours: rows.map((row) => ({
        weekday: row.weekday,
        openMinutes: row.openMinutes,
        closeMinutes: row.closeMinutes,
        isClosed: row.isClosed,
      })),
    };
  }
}
export class UberMenuStoreMappingPrismaRepository implements MenuStoreMappingRepository {
  constructor(private readonly db: MenuDb) {}
  async findByPosStoreId(storeId: string) {
    const row = await this.db.uberStoreMapping.findFirst({
      where: {
        OR: [{ posExternalStoreId: storeId }, { uberStoreId: storeId }],
      },
      select: {
        uberStoreId: true,
        connectionId: true,
        posExternalStoreId: true,
        isProvisioned: true,
        rawPayload: true,
      },
    });
    return row
      ? {
          uberStoreId: row.uberStoreId,
          connectionId: row.connectionId,
          posExternalStoreId: row.posExternalStoreId,
          isProvisioned: row.isProvisioned,
          timezone: readStoreTimezone(row.rawPayload),
        }
      : null;
  }
}

export const createUberMenuRepositoryScope = (
  db: MenuDb,
): UberMenuRepositoryScope => ({
  snapshots: new UberMenuSnapshotPrismaRepository(db),
  itemChannels: new UberItemChannelConfigPrismaRepository(db),
  modifiers: new UberModifierConfigPrismaRepository(db),
  schedules: new UberBusinessSchedulePrismaRepository(db),
  storeMappings: new UberMenuStoreMappingPrismaRepository(db),
});
@Injectable()
export class PrismaUberMenuUnitOfWork implements UberMenuUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}
  execute<T>(
    work: (repositories: UberMenuRepositoryScope) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work(createUberMenuRepositoryScope(tx)),
    );
  }
}
