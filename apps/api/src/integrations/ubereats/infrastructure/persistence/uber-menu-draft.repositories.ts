import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  UBER_BUSINESS_SCHEDULE_QUERY_PORT,
  type UberBusinessScheduleQueryPort,
} from '../../application/menu/uber-menu-draft.ports';
import {
  UBER_CATALOG_MENU_FACTS_QUERY,
  type UberCatalogMenuFactsQueryPort,
} from '../../application/shared/uber-catalog-menu-facts.port';
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
import { readUberPreparationType } from '../../domain/menu/uber-menu.types';

type MenuDb = PrismaService | Prisma.TransactionClient;

/** Combines Catalog-owned source facts with Uber-owned persisted channel configuration. */
export class UberMenuDraftSourcePrismaRepository {
  constructor(
    private readonly db: MenuDb,
    private readonly catalogFacts: UberCatalogMenuFactsQueryPort,
  ) {}

  async load(
    storeStableId: string,
    uberStoreId: string,
  ): Promise<UberMenuDraftSource> {
    const [
      sourceFacts,
      rawItemConfigs,
      rawOptionConfigs,
      rawModifierConfigs,
      rawCategoryConfigs,
    ] = await Promise.all([
      this.catalogFacts.readMenuSource(),
      this.db.uberItemChannelConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
          preparationType: true,
        },
      }),
      this.db.uberOptionItemConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
          preparationType: true,
        },
      }),
      this.db.uberModifierGroupConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          templateGroupStableId: true,
          displayName: true,
          minSelect: true,
          maxSelect: true,
          isActive: true,
        },
      }),
      this.db.uberCategoryConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          menuCategoryStableId: true,
          displayName: true,
          sortOrder: true,
          isActive: true,
        },
      }),
    ]);

    const categories = sourceFacts.categories.map((category) => ({
      id: category.stableId,
      stableId: category.stableId,
      nameEn: category.nameEn,
      nameZh: category.nameZh,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    }));
    const menuItems = sourceFacts.menuItems
      .filter(
        (item) => item.visibility === 'PUBLIC' && item.publishToUberEats,
      )
      .map((item) => ({
        stableId: item.stableId,
        categoryId: item.categoryStableId,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        basePriceCents: item.basePriceCents,
        isAvailable: item.isAvailable,
        tempUnavailableUntil: item.tempUnavailableUntil,
        sortOrder: item.sortOrder,
        imageUrl: item.imageUrl,
        ingredientsEn: item.ingredientsEn,
        optionGroups: item.optionGroups
          .filter((binding) => binding.isEnabled)
          .map(({ templateGroupStableId, sortOrder }) => ({
            templateGroup: { stableId: templateGroupStableId },
            sortOrder,
          })),
      }));
    const modifierTemplates = sourceFacts.modifierTemplates.map((template) => ({
      stableId: template.stableId,
      nameEn: template.nameEn,
      nameZh: template.nameZh,
      defaultMinSelect: template.defaultMinSelect,
      defaultMaxSelect: template.defaultMaxSelect,
      isAvailable: template.isAvailable,
      sortOrder: template.sortOrder,
      options: template.options.map((option) => ({
        stableId: option.stableId,
        nameEn: option.nameEn,
        nameZh: option.nameZh,
        priceDeltaCents: option.priceDeltaCents,
        isAvailable: option.isAvailable,
        tempUnavailableUntil: option.tempUnavailableUntil,
        sortOrder: option.sortOrder,
        childLinks: option.childTemplateGroupStableIds.map((stableId) => ({
          childOption: { templateGroup: { stableId } },
        })),
      })),
    }));

    const itemConfigs = rawItemConfigs.map((config) => ({
      ...config,
      preparationType: readUberPreparationType(config.preparationType),
    }));
    const optionConfigs = rawOptionConfigs.map((config) => ({
      ...config,
      preparationType: readUberPreparationType(config.preparationType),
    }));
    const modifierConfigs = rawModifierConfigs;
    const categoryConfigs = rawCategoryConfigs;

    return {
      storeId: storeStableId,
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
  constructor(
    private readonly catalogFacts: UberCatalogMenuFactsQueryPort,
  ) {}
  async load() {
    const source = await this.catalogFacts.readMenuSource();
    return {
      categories: source.categories.map((row) => ({
        stableId: row.stableId,
        name: row.nameEn,
        sortOrder: row.sortOrder,
      })),
      items: source.menuItems
        .filter((row) => row.publishToUberEats)
        .map((row) => ({
          stableId: row.stableId,
          categoryStableId: row.categoryStableId,
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
        preparationType: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      stableId: row.menuItemStableId,
      priceCents: row.priceCents,
      isAvailable: row.isAvailable,
      displayName: row.displayName,
      displayDescription: row.displayDescription,
      preparationType: readUberPreparationType(row.preparationType),
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
export class UberBusinessScheduleRepositoryAdapter implements BusinessScheduleRepository {
  constructor(private readonly schedules: UberBusinessScheduleQueryPort) {}

  get(storeStableId: string) {
    return this.schedules.readBusinessSchedule(storeStableId);
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
  businessSchedule: UberBusinessScheduleQueryPort,
  catalogFacts: UberCatalogMenuFactsQueryPort,
): UberMenuRepositoryScope => ({
  snapshots: new UberMenuSnapshotPrismaRepository(catalogFacts),
  itemChannels: new UberItemChannelConfigPrismaRepository(db),
  modifiers: new UberModifierConfigPrismaRepository(db),
  schedules: new UberBusinessScheduleRepositoryAdapter(businessSchedule),
  storeMappings: new UberMenuStoreMappingPrismaRepository(db),
});
@Injectable()
export class PrismaUberMenuUnitOfWork implements UberMenuUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_BUSINESS_SCHEDULE_QUERY_PORT)
    private readonly businessSchedule: UberBusinessScheduleQueryPort,
    @Inject(UBER_CATALOG_MENU_FACTS_QUERY)
    private readonly catalogFacts: UberCatalogMenuFactsQueryPort,
  ) {}
  execute<T>(
    work: (repositories: UberMenuRepositoryScope) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work(
        createUberMenuRepositoryScope(
          tx,
          this.businessSchedule,
          this.catalogFacts,
        ),
      ),
    );
  }
}
