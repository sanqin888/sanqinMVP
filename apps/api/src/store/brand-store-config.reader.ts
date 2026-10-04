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
  type StoreTimezoneReaderPort,
} from './brand-store-config.contract';
import {
  appendStoreScheduleVersion,
  finishStoreTemporaryClosure,
  initializeStoreOperatingHistory,
  reviseStoreTemporaryClosureEnd,
  startStoreTemporaryClosure,
} from './store-operating-history.persistence';
import { resolveConfiguredStoreStableId } from './store-identity';
import { parseAutoPauseReason } from './temporary-closure-reason';
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
    StoreTimezoneReaderPort
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

  async getStoreSnapshot(storeStableId: string): Promise<StoreConfigSnapshot> {
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

  async getStoreTimezone(
    storeStableId: string,
  ): Promise<{ storeStableId: string; timezone: string }> {
    const store = await this.prisma.store.findUnique({
      where: { storeStableId },
      select: {
        storeStableId: true,
        config: { select: { timezone: true } },
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
      timezone: store.config.timezone,
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
    const effectiveAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { storeStableId },
        select: {
          id: true,
          config: {
            select: {
              storeId: true,
              timezone: true,
              isTemporarilyClosed: true,
              temporaryCloseReason: true,
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

      const history = await tx.storeOperatingHistoryState.findUnique({
        where: { storeDbId: store.id },
        select: { storeDbId: true, trackingStartedAt: true },
      });
      const previousClosed = store.config.isTemporarilyClosed;
      const nextClosed =
        input.isTemporarilyClosed ?? store.config.isTemporarilyClosed;
      const previousReason = store.config.temporaryCloseReason;
      const nextReason =
        input.temporaryCloseReason === undefined
          ? previousReason
          : input.temporaryCloseReason;
      const timezoneChanged =
        input.timezone !== undefined && input.timezone !== store.config.timezone;

      await tx.storeConfig.update({
        where: { storeId: store.id },
        data: input,
      });

      if (!history) {
        await initializeStoreOperatingHistory(tx, store.id, effectiveAt);
        return;
      }

      if (!previousClosed && nextClosed) {
        await startStoreTemporaryClosure(
          tx,
          store.id,
          effectiveAt,
          nextReason,
        );
      } else if (previousClosed && !nextClosed) {
        const previousAutoPause = parseAutoPauseReason(previousReason);
        const plannedEnd = previousAutoPause
          ? new Date(previousAutoPause.autoResumeAt)
          : null;
        const predatesTracking =
          plannedEnd &&
          !Number.isNaN(plannedEnd.getTime()) &&
          plannedEnd <= history.trackingStartedAt;
        if (!predatesTracking) {
          await finishStoreTemporaryClosure(tx, store.id, effectiveAt);
        }
      } else if (
        previousClosed &&
        nextClosed &&
        nextReason !== previousReason
      ) {
        await reviseStoreTemporaryClosureEnd(
          tx,
          store.id,
          effectiveAt,
          nextReason,
        );
      }

      if (timezoneChanged) {
        await appendStoreScheduleVersion(tx, store.id, effectiveAt);
      }
    });
  }

  async startTemporaryClosure(
    storeStableId: string,
    reason: string,
  ): Promise<boolean> {
    const startedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { storeStableId },
        select: {
          id: true,
          config: {
            select: {
              storeId: true,
              isTemporarilyClosed: true,
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
      if (store.config.isTemporarilyClosed) return false;

      const history = await tx.storeOperatingHistoryState.findUnique({
        where: { storeDbId: store.id },
        select: { storeDbId: true },
      });
      const started = await tx.storeConfig.updateMany({
        where: {
          storeId: store.id,
          isTemporarilyClosed: false,
        },
        data: {
          isTemporarilyClosed: true,
          temporaryCloseReason: reason,
        },
      });
      if (started.count === 0) return false;
      if (history) {
        await startStoreTemporaryClosure(tx, store.id, startedAt, reason);
      } else {
        await initializeStoreOperatingHistory(tx, store.id, startedAt);
      }
      return true;
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
            id: true,
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
        await initializeStoreOperatingHistory(tx, store.id, new Date());
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
    const reconciledAt = new Date();
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

      const history = await tx.storeOperatingHistoryState.findUnique({
        where: { storeDbId: store.id },
        select: { storeDbId: true, trackingStartedAt: true },
      });
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

      if (!history) {
        await initializeStoreOperatingHistory(tx, store.id, reconciledAt);
        return true;
      }

      const parsed = parseAutoPauseReason(expectedReason);
      const plannedEnd = parsed ? new Date(parsed.autoResumeAt) : null;
      if (
        plannedEnd &&
        !Number.isNaN(plannedEnd.getTime()) &&
        plannedEnd <= history.trackingStartedAt
      ) {
        return true;
      }
      await finishStoreTemporaryClosure(
        tx,
        store.id,
        plannedEnd && !Number.isNaN(plannedEnd.getTime())
          ? plannedEnd
          : reconciledAt,
      );
      return true;
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
    const effectiveAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { storeStableId },
        select: { id: true },
      });
      if (!store) {
        throw new BrandStoreConfigUnavailableError(
          `Store ${storeStableId} is not provisioned`,
        );
      }
      const storeDbId = store.id;
      const current = await tx.businessHour.findMany({
        where: { storeDbId },
        orderBy: { weekday: 'asc' },
        select: {
          weekday: true,
          openMinutes: true,
          closeMinutes: true,
          isClosed: true,
        },
      });
      const next = [...hours].sort((a, b) => a.weekday - b.weekday);
      const unchanged =
        current.length === next.length &&
        current.every(
          (row, index) =>
            row.weekday === next[index]?.weekday &&
            row.openMinutes === next[index]?.openMinutes &&
            row.closeMinutes === next[index]?.closeMinutes &&
            row.isClosed === next[index]?.isClosed,
        );
      if (unchanged) return;

      const history = await tx.storeOperatingHistoryState.findUnique({
        where: { storeDbId },
        select: { storeDbId: true },
      });
      await tx.businessHour.deleteMany({ where: { storeDbId } });
      if (next.length > 0) {
        await tx.businessHour.createMany({
          data: next.map((hour) => ({
            storeDbId,
            weekday: hour.weekday,
            openMinutes: hour.openMinutes,
            closeMinutes: hour.closeMinutes,
            isClosed: hour.isClosed,
          })),
        });
      }

      if (history) {
        await appendStoreScheduleVersion(tx, storeDbId, effectiveAt);
      } else {
        await initializeStoreOperatingHistory(tx, storeDbId, effectiveAt);
      }
    });
  }

  async replaceHolidays(
    storeStableId: string,
    holidays: StoreHoliday[],
  ): Promise<void> {
    const effectiveAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { storeStableId },
        select: { id: true },
      });
      if (!store) {
        throw new BrandStoreConfigUnavailableError(
          `Store ${storeStableId} is not provisioned`,
        );
      }
      const storeDbId = store.id;
      const current = await tx.holiday.findMany({
        where: { storeDbId },
        orderBy: { date: 'asc' },
        select: {
          date: true,
          name: true,
          isClosed: true,
          openMinutes: true,
          closeMinutes: true,
        },
      });
      const next = [...holidays].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const unchanged =
        current.length === next.length &&
        current.every(
          (row, index) =>
            row.date.toISOString().slice(0, 10) === next[index]?.date &&
            row.name === next[index]?.name &&
            row.isClosed === next[index]?.isClosed &&
            row.openMinutes === next[index]?.openMinutes &&
            row.closeMinutes === next[index]?.closeMinutes,
        );
      if (unchanged) return;

      const history = await tx.storeOperatingHistoryState.findUnique({
        where: { storeDbId },
        select: { storeDbId: true },
      });
      await tx.holiday.deleteMany({ where: { storeDbId } });
      if (next.length > 0) {
        await tx.holiday.createMany({
          data: next.map((holiday) => ({
            storeDbId,
            date: new Date(`${holiday.date}T00:00:00.000Z`),
            name: holiday.name,
            isClosed: holiday.isClosed,
            openMinutes: holiday.openMinutes,
            closeMinutes: holiday.closeMinutes,
          })),
        });
      }

      if (history) {
        await appendStoreScheduleVersion(tx, storeDbId, effectiveAt);
      } else {
        await initializeStoreOperatingHistory(tx, storeDbId, effectiveAt);
      }
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
