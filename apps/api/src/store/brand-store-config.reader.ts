import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrandStoreConfigUnavailableError,
  StoreStableIdAlreadyExistsError,
  type BrandConfigSnapshot,
  type BrandConfigUpdateInput,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigWriterPort,
  type CreateStoreInput,
  type StoreConfigSnapshot,
  type StoreConfigUpdateInput,
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

  getConfiguredStoreSnapshot(): Promise<StoreConfigSnapshot> {
    return this.getStoreSnapshot(resolveConfiguredStoreStableId());
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

}

@Injectable()
export class PrismaBrandStoreConfigWriter
  implements BrandStoreConfigWriterPort, StoreDirectoryWriterPort
{
  constructor(private readonly prisma: PrismaService) {}

  async updateBrandConfig(input: BrandConfigUpdateInput): Promise<void> {
    if (Object.keys(input).length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const brand = await tx.brandConfig.findUnique({
        where: { id: 1 },
        select: { id: true },
      });
      if (!brand) {
        throw new BrandStoreConfigUnavailableError(
          'BrandConfig(id=1) is not provisioned',
        );
      }

      await tx.brandConfig.update({
        where: { id: 1 },
        data: input,
      });
    });
  }

  async updateStoreConfig(
    storeStableId: string,
    input: StoreConfigUpdateInput,
  ): Promise<void> {
    if (Object.keys(input).length === 0) return;

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
        data: input,
      });
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
    storeStableId: string,
    expectedReason: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
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
      return result.count > 0;
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
