import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrandStoreConfigUnavailableError,
  StoreStableIdAlreadyExistsError,
  type BrandConfigSnapshot,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type BrandStoreConfigUpdateInput,
  type BrandStoreConfigWriterPort,
  type CreateStoreInput,
  type StoreConfigSnapshot,
  type StoreDirectoryEntry,
  type StoreDirectoryReaderPort,
  type StoreDirectoryWriterPort,
  type StoreLegacyDbIdResolverPort,
} from './brand-store-config.contract';
import { resolveConfiguredStoreStableId } from './store-identity';
import type {
  StoreBusinessHour,
  StoreHoliday,
  StoreScheduleReaderPort,
  StoreScheduleWriterPort,
  StoreWeekday,
} from './store-schedule.contract';

@Injectable()
export class PrismaBrandStoreConfigReader
  implements
    BrandStoreConfigReaderPort,
    StoreDirectoryReaderPort,
    StoreLegacyDbIdResolverPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getBrandSnapshot(): Promise<BrandConfigSnapshot> {
    const brand = await this.prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: {
        brandNameZh: true,
        brandNameEn: true,
        siteUrl: true,
        emailFromNameZh: true,
        emailFromNameEn: true,
        emailFromAddress: true,
        smsSignature: true,
        supportPhone: true,
        supportEmail: true,
        wechatAlipayExchangeRate: true,
      },
    });

    if (!brand) {
      throw new BrandStoreConfigUnavailableError(
        'BrandConfig(id=1) is not provisioned',
      );
    }

    return brand;
  }

  async getStoreSnapshot(
    requestedStoreStableId?: string,
  ): Promise<StoreConfigSnapshot> {
    const storeStableId =
      requestedStoreStableId ?? resolveConfiguredStoreStableId();
    const store = await this.prisma.store.findUnique({
      where: { storeStableId },
      select: {
        storeStableId: true,
        name: true,
        isActive: true,
        config: {
          select: {
            timezone: true,
            isTemporarilyClosed: true,
            temporaryCloseReason: true,
            publicNotice: true,
            publicNoticeEn: true,
            deliveryBaseFeeCents: true,
            priorityPerKmCents: true,
            maxDeliveryRangeKm: true,
            priorityDefaultDistanceKm: true,
            latitude: true,
            longitude: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            province: true,
            postalCode: true,
            countryCode: true,
            phone: true,
            contactName: true,
            salesTaxRate: true,
            enableUberDirect: true,
            autoAcceptOnlineOrders: true,
            allergyHandlingMode: true,
            unsupportedAllergens: true,
          },
        },
      },
    });

    if (!store) {
      throw new BrandStoreConfigUnavailableError(
        `Configured store ${storeStableId} is not provisioned`,
      );
    }
    if (!store.config) {
      throw new BrandStoreConfigUnavailableError(
        `StoreConfig for ${storeStableId} is not provisioned`,
      );
    }

    return {
      storeStableId: store.storeStableId,
      storeName: store.name,
      isActive: store.isActive,
      ...store.config,
    };
  }

  async listStores(): Promise<StoreDirectoryEntry[]> {
    const stores = await this.prisma.store.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        storeStableId: true,
        name: true,
        isActive: true,
      },
    });
    return stores.map((store) => ({
      storeStableId: store.storeStableId,
      storeName: store.name,
      isActive: store.isActive,
    }));
  }

  // @compat pos-device.admin-db-id.v1
  async resolveStoreStableIdByDbId(storeDbId: string): Promise<string | null> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeDbId },
      select: { storeStableId: true },
    });
    return store?.storeStableId ?? null;
  }

  async getSnapshot(): Promise<BrandStoreConfigSnapshot> {
    const [brand, store] = await Promise.all([
      this.getBrandSnapshot(),
      this.getStoreSnapshot(),
    ]);
    return { brand, store };
  }
}

const BRAND_COMPATIBILITY_SELECT = {
  brandNameZh: true,
  brandNameEn: true,
  siteUrl: true,
  emailFromNameZh: true,
  emailFromNameEn: true,
  emailFromAddress: true,
  smsSignature: true,
  supportPhone: true,
  supportEmail: true,
  wechatAlipayExchangeRate: true,
} as const;

const STORE_COMPATIBILITY_SELECT = {
  timezone: true,
  isTemporarilyClosed: true,
  temporaryCloseReason: true,
  publicNotice: true,
  publicNoticeEn: true,
  deliveryBaseFeeCents: true,
  priorityPerKmCents: true,
  maxDeliveryRangeKm: true,
  priorityDefaultDistanceKm: true,
  latitude: true,
  longitude: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  province: true,
  postalCode: true,
  salesTaxRate: true,
  enableUberDirect: true,
} as const;

type StoreCompatibilitySnapshot = Pick<
  StoreConfigSnapshot,
  keyof typeof STORE_COMPATIBILITY_SELECT
>;

@Injectable()
export class PrismaBrandStoreConfigWriter
  implements BrandStoreConfigWriterPort, StoreDirectoryWriterPort
{
  constructor(private readonly prisma: PrismaService) {}

  // @compat brand-store.business-config.v1
  // Canonical BrandConfig/StoreConfig are the write targets. The complete
  // overlapping Brand/Store snapshot is copied back to BusinessConfig while
  // registered legacy writes can still fire the one-way compatibility trigger
  // and replay that row into canonical storage.
  async updateConfig(
    input: BrandStoreConfigUpdateInput,
    requestedStoreStableId?: string,
  ): Promise<void> {
    const brandPatch = input.brand ?? {};
    const storePatch = input.store ?? {};
    const hasBrandPatch = Object.keys(brandPatch).length > 0;
    const hasStorePatch = Object.keys(storePatch).length > 0;

    if (!hasBrandPatch && !hasStorePatch) return;

    const configuredStoreStableId = resolveConfiguredStoreStableId();
    const storeStableId = requestedStoreStableId ?? configuredStoreStableId;
    const hasCompatibilityPatch =
      hasBrandPatch ||
      (storeStableId === configuredStoreStableId &&
        Object.keys(storePatch).some(
          (key) => key in STORE_COMPATIBILITY_SELECT,
        ));

    if (!hasCompatibilityPatch) {
      await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({
          where: { storeStableId },
          select: { id: true, config: { select: { storeId: true } } },
        });
        if (!store) {
          throw new BrandStoreConfigUnavailableError(
            `Configured store ${storeStableId} is not provisioned`,
          );
        }
        if (!store.config) {
          throw new BrandStoreConfigUnavailableError(
            `StoreConfig for ${storeStableId} is not provisioned`,
          );
        }
        await tx.storeConfig.update({
          where: { storeId: store.id },
          data: storePatch,
        });
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const [brand, store] = await Promise.all([
        tx.brandConfig.findUnique({
          where: { id: 1 },
          select: BRAND_COMPATIBILITY_SELECT,
        }),
        tx.store.findUnique({
          where: { storeStableId },
          select: {
            id: true,
            name: true,
            config: { select: STORE_COMPATIBILITY_SELECT },
          },
        }),
      ]);

      if (!brand) {
        throw new BrandStoreConfigUnavailableError(
          'BrandConfig(id=1) is not provisioned',
        );
      }
      if (!store) {
        throw new BrandStoreConfigUnavailableError(
          `Configured store ${storeStableId} is not provisioned`,
        );
      }
      if (!store.config) {
        throw new BrandStoreConfigUnavailableError(
          `StoreConfig for ${storeStableId} is not provisioned`,
        );
      }

      const nextBrand = hasBrandPatch
        ? await tx.brandConfig.update({
            where: { id: 1 },
            data: brandPatch,
            select: BRAND_COMPATIBILITY_SELECT,
          })
        : brand;

      const nextStore = hasStorePatch
        ? await tx.storeConfig.update({
            where: { storeId: store.id },
            data: storePatch,
            select: STORE_COMPATIBILITY_SELECT,
          })
        : store.config;

      await this.refreshBusinessConfigCompatibility(
        tx,
        store.name,
        nextBrand,
        nextStore,
      );
    });
  }

  async createStore(input: CreateStoreInput): Promise<StoreConfigSnapshot> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.store.findFirst({
          where: {
            storeStableId: {
              equals: input.storeStableId,
              mode: 'insensitive',
            },
          },
          select: { storeStableId: true },
        });
        if (duplicate) {
          throw new StoreStableIdAlreadyExistsError(input.storeStableId);
        }

        const store = await tx.store.create({
          data: {
            storeStableId: input.storeStableId,
            name: input.storeName,
            config: { create: {} },
            businessHours: {
              create: Array.from({ length: 7 }, (_, weekday) => ({
                weekday,
                isClosed: true,
                openMinutes: null,
                closeMinutes: null,
              })),
            },
          },
          select: {
            storeStableId: true,
            name: true,
            isActive: true,
            config: {
              select: {
                timezone: true,
                isTemporarilyClosed: true,
                temporaryCloseReason: true,
                publicNotice: true,
                publicNoticeEn: true,
                deliveryBaseFeeCents: true,
                priorityPerKmCents: true,
                maxDeliveryRangeKm: true,
                priorityDefaultDistanceKm: true,
                latitude: true,
                longitude: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                province: true,
                postalCode: true,
                countryCode: true,
                phone: true,
                contactName: true,
                salesTaxRate: true,
                enableUberDirect: true,
                autoAcceptOnlineOrders: true,
                allergyHandlingMode: true,
                unsupportedAllergens: true,
              },
            },
          },
        });
        if (!store.config) {
          throw new BrandStoreConfigUnavailableError(
            `StoreConfig for ${input.storeStableId} was not provisioned`,
          );
        }
        return {
          storeStableId: store.storeStableId,
          storeName: store.name,
          isActive: store.isActive,
          ...store.config,
        };
      });
    } catch (error) {
      if (error instanceof StoreStableIdAlreadyExistsError) throw error;
      const prismaErrorCode =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
      if (prismaErrorCode === 'P2002') {
        throw new StoreStableIdAlreadyExistsError(input.storeStableId);
      }
      throw error;
    }
  }

  async resumeTemporaryClosureIfMatches(
    expectedReason: string,
  ): Promise<boolean> {
    const storeStableId = resolveConfiguredStoreStableId();

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { storeStableId },
        select: {
          id: true,
          name: true,
          config: { select: STORE_COMPATIBILITY_SELECT },
        },
      });
      if (!store) {
        throw new BrandStoreConfigUnavailableError(
          `Configured store ${storeStableId} is not provisioned`,
        );
      }
      if (!store.config) {
        throw new BrandStoreConfigUnavailableError(
          `StoreConfig for ${storeStableId} is not provisioned`,
        );
      }

      const result = await tx.storeConfig.updateMany({
        where: {
          storeId: store.id,
          isTemporarilyClosed: true,
          temporaryCloseReason: expectedReason,
        },
        data: {
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
        },
      });
      if (result.count === 0) return false;

      const [brand, nextStore] = await Promise.all([
        tx.brandConfig.findUnique({
          where: { id: 1 },
          select: BRAND_COMPATIBILITY_SELECT,
        }),
        tx.storeConfig.findUnique({
          where: { storeId: store.id },
          select: STORE_COMPATIBILITY_SELECT,
        }),
      ]);
      if (!brand) {
        throw new BrandStoreConfigUnavailableError(
          'BrandConfig(id=1) is not provisioned',
        );
      }
      if (!nextStore) {
        throw new BrandStoreConfigUnavailableError(
          `StoreConfig for ${storeStableId} is not provisioned`,
        );
      }

      await this.refreshBusinessConfigCompatibility(
        tx,
        store.name,
        brand,
        nextStore,
      );
      return true;
    });
  }

  private async refreshBusinessConfigCompatibility(
    tx: Prisma.TransactionClient,
    storeName: string,
    brand: BrandConfigSnapshot,
    store: StoreCompatibilitySnapshot,
  ): Promise<void> {
    await tx.businessConfig.update({
      where: { id: 1 },
      data: {
        storeName,
        timezone: store.timezone,
        isTemporarilyClosed: store.isTemporarilyClosed,
        temporaryCloseReason: store.temporaryCloseReason,
        publicNotice: store.publicNotice,
        publicNoticeEn: store.publicNoticeEn,
        deliveryBaseFeeCents: store.deliveryBaseFeeCents,
        priorityPerKmCents: store.priorityPerKmCents,
        maxDeliveryRangeKm: store.maxDeliveryRangeKm,
        priorityDefaultDistanceKm: store.priorityDefaultDistanceKm,
        storeLatitude: store.latitude,
        storeLongitude: store.longitude,
        storeAddressLine1: store.addressLine1,
        storeAddressLine2: store.addressLine2,
        storeCity: store.city,
        storeProvince: store.province,
        storePostalCode: store.postalCode,
        brandNameZh: brand.brandNameZh,
        brandNameEn: brand.brandNameEn,
        siteUrl: brand.siteUrl,
        emailFromNameZh: brand.emailFromNameZh,
        emailFromNameEn: brand.emailFromNameEn,
        emailFromAddress: brand.emailFromAddress,
        smsSignature: brand.smsSignature,
        supportPhone: brand.supportPhone,
        supportEmail: brand.supportEmail,
        salesTaxRate: store.salesTaxRate,
        wechatAlipayExchangeRate: brand.wechatAlipayExchangeRate,
        enableUberDirect: store.enableUberDirect,
      },
    });
  }
}

@Injectable()
export class PrismaStoreScheduleAdapter
  implements StoreScheduleReaderPort, StoreScheduleWriterPort
{
  constructor(private readonly prisma: PrismaService) {}

  async listBusinessHours(storeStableId: string): Promise<StoreBusinessHour[]> {
    const storeDbId = await this.resolveStoreDbId(storeStableId);
    const rows = await this.prisma.businessHour.findMany({
      where: { storeDbId },
      orderBy: { weekday: 'asc' },
    });

    return rows.map((row) => ({
      weekday: row.weekday as StoreWeekday,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      isClosed: row.isClosed,
    }));
  }

  async getBusinessHour(
    storeStableId: string,
    weekday: StoreWeekday,
  ): Promise<StoreBusinessHour | null> {
    const storeDbId = await this.resolveStoreDbId(storeStableId);
    const row = await this.prisma.businessHour.findUnique({
      where: { storeDbId_weekday: { storeDbId, weekday } },
    });

    if (!row) return null;
    return {
      weekday: row.weekday as StoreWeekday,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      isClosed: row.isClosed,
    };
  }

  async listHolidays(storeStableId: string): Promise<StoreHoliday[]> {
    const storeDbId = await this.resolveStoreDbId(storeStableId);
    const rows = await this.prisma.holiday.findMany({
      where: { storeDbId },
      orderBy: { date: 'asc' },
    });

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      name: row.name,
      isClosed: row.isClosed,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
    }));
  }

  async replaceBusinessHours(
    storeStableId: string,
    hours: StoreBusinessHour[],
  ): Promise<void> {
    const storeDbId = await this.resolveStoreDbId(storeStableId);

    await this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({ where: { storeDbId } });
      if (hours.length === 0) return;

      await tx.businessHour.createMany({
        data: hours.map((hour) => ({
          storeDbId,
          weekday: hour.weekday,
          openMinutes: hour.openMinutes,
          closeMinutes: hour.closeMinutes,
          isClosed: hour.isClosed,
        })),
      });
    });
  }

  async replaceHolidays(
    storeStableId: string,
    holidays: StoreHoliday[],
  ): Promise<void> {
    const storeDbId = await this.resolveStoreDbId(storeStableId);

    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.deleteMany({ where: { storeDbId } });
      if (holidays.length === 0) return;

      await tx.holiday.createMany({
        data: holidays.map((holiday) => ({
          storeDbId,
          date: new Date(`${holiday.date}T00:00:00.000Z`),
          name: holiday.name,
          isClosed: holiday.isClosed,
          openMinutes: holiday.openMinutes,
          closeMinutes: holiday.closeMinutes,
        })),
      });
    });
  }

  private async resolveStoreDbId(storeStableId: string): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { storeStableId },
      select: { id: true },
    });
    if (!store) {
      throw new BrandStoreConfigUnavailableError(
        `Store ${storeStableId} is not provisioned`,
      );
    }
    return store.id;
  }
}
