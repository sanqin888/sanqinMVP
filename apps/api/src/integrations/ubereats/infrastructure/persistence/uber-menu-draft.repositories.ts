import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  BusinessScheduleRepository,
  ItemChannelConfigRepository,
  MenuSnapshotRepository,
  MenuStoreMappingRepository,
  ModifierBindingRepository,
  ModifierConfigRepository,
  UberMenuRepositoryScope,
  UberMenuUnitOfWork,
} from '../../application/ports/uber-menu-repositories.ports';

type MenuDb = PrismaService | Prisma.TransactionClient;
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
export class UberModifierBindingPrismaRepository implements ModifierBindingRepository {
  constructor(private readonly db: MenuDb) {}
  async list(storeId: string) {
    const rows = await this.db.uberOptionChildGroupBinding.findMany({
      where: { storeId },
      select: {
        storeId: true,
        parentOptionChoiceStableId: true,
        childTemplateGroupStableId: true,
        isBound: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      parentOptionStableId: row.parentOptionChoiceStableId,
      childGroupStableId: row.childTemplateGroupStableId,
      isBound: row.isBound,
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
        merchantUberUserId: true,
        posExternalStoreId: true,
        isProvisioned: true,
        rawPayload: true,
      },
    });
    return row
      ? {
          uberStoreId: row.uberStoreId,
          merchantUberUserId: row.merchantUberUserId,
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
  bindings: new UberModifierBindingPrismaRepository(db),
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
