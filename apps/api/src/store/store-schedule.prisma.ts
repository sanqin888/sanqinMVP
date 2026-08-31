import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrandStoreConfigUnavailableError } from './brand-store-config.contract';
import type {
  StoreBusinessHour,
  StoreHoliday,
  StoreScheduleReaderPort,
  StoreScheduleWriterPort,
  StoreWeekday,
} from './store-schedule.contract';

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
      where: {
        storeDbId_weekday: { storeDbId, weekday },
      },
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
