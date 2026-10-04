import type { Prisma } from '@prisma/client';
import { parseAutoPauseReason } from './temporary-closure-reason';

type StoreHistoryTx = Prisma.TransactionClient;

type StoreScheduleSnapshot = {
  timezone: string;
  businessHours: Array<{
    weekday: number;
    openMinutes: number | null;
    closeMinutes: number | null;
    isClosed: boolean;
  }>;
  holidays: Array<{
    date: string;
    name: string | null;
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  }>;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
};

function plannedClosureEnd(reason: string | null): Date | null {
  const parsed = parseAutoPauseReason(reason);
  if (!parsed) return null;
  const value = new Date(parsed.autoResumeAt);
  return Number.isNaN(value.getTime()) ? null : value;
}

async function readStoreScheduleSnapshot(
  tx: StoreHistoryTx,
  storeDbId: string,
): Promise<StoreScheduleSnapshot> {
  const store = await tx.store.findUnique({
    where: { id: storeDbId },
    select: {
      config: {
        select: {
          timezone: true,
          isTemporarilyClosed: true,
          temporaryCloseReason: true,
        },
      },
      businessHours: {
        orderBy: { weekday: 'asc' },
        select: {
          weekday: true,
          openMinutes: true,
          closeMinutes: true,
          isClosed: true,
        },
      },
      holidays: {
        orderBy: { date: 'asc' },
        select: {
          date: true,
          name: true,
          isClosed: true,
          openMinutes: true,
          closeMinutes: true,
        },
      },
    },
  });
  if (!store?.config) {
    throw new Error(`Store history source is not provisioned: ${storeDbId}`);
  }
  return {
    timezone: store.config.timezone,
    isTemporarilyClosed: store.config.isTemporarilyClosed,
    temporaryCloseReason: store.config.temporaryCloseReason,
    businessHours: store.businessHours.map((row) => ({
      weekday: row.weekday,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      isClosed: row.isClosed,
    })),
    holidays: store.holidays.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      name: row.name,
      isClosed: row.isClosed,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
    })),
  };
}

export async function initializeStoreOperatingHistory(
  tx: StoreHistoryTx,
  storeDbId: string,
  trackingStartedAt: Date,
): Promise<boolean> {
  const inserted = await tx.storeOperatingHistoryState.createMany({
    data: [
      {
        storeDbId,
        trackingStartedAt,
        scheduleRevision: 1,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false;

  const snapshot = await readStoreScheduleSnapshot(tx, storeDbId);
  await tx.storeScheduleVersion.create({
    data: {
      storeDbId,
      revision: 1,
      effectiveFrom: trackingStartedAt,
      timezone: snapshot.timezone,
      businessHoursSnapshot:
        snapshot.businessHours as unknown as Prisma.InputJsonValue,
      holidaysSnapshot: snapshot.holidays as unknown as Prisma.InputJsonValue,
    },
  });

  if (snapshot.isTemporarilyClosed) {
    const plannedEnd = plannedClosureEnd(snapshot.temporaryCloseReason);
    if (!plannedEnd || plannedEnd > trackingStartedAt) {
      await tx.storeTemporaryClosureInterval.create({
        data: {
          storeDbId,
          startedAt: trackingStartedAt,
          endedAt: plannedEnd,
        },
      });
    }
  }
  return true;
}

export async function appendStoreScheduleVersion(
  tx: StoreHistoryTx,
  storeDbId: string,
  effectiveFrom: Date,
): Promise<void> {
  const next = await tx.storeOperatingHistoryState.update({
    where: { storeDbId },
    data: { scheduleRevision: { increment: 1 } },
    select: { scheduleRevision: true },
  });
  const snapshot = await readStoreScheduleSnapshot(tx, storeDbId);
  await tx.storeScheduleVersion.create({
    data: {
      storeDbId,
      revision: next.scheduleRevision,
      effectiveFrom,
      timezone: snapshot.timezone,
      businessHoursSnapshot:
        snapshot.businessHours as unknown as Prisma.InputJsonValue,
      holidaysSnapshot: snapshot.holidays as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function startStoreTemporaryClosure(
  tx: StoreHistoryTx,
  storeDbId: string,
  startedAt: Date,
  reason: string | null,
): Promise<void> {
  const plannedEnd = plannedClosureEnd(reason);
  await tx.storeTemporaryClosureInterval.create({
    data: {
      storeDbId,
      startedAt,
      endedAt: plannedEnd && plannedEnd > startedAt ? plannedEnd : null,
    },
  });
}

async function latestClosure(
  tx: StoreHistoryTx,
  storeDbId: string,
  at: Date,
) {
  return tx.storeTemporaryClosureInterval.findFirst({
    where: { storeDbId, startedAt: { lte: at } },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, endedAt: true },
  });
}

export async function finishStoreTemporaryClosure(
  tx: StoreHistoryTx,
  storeDbId: string,
  endedAt: Date,
): Promise<void> {
  const interval = await latestClosure(tx, storeDbId, endedAt);
  if (!interval) {
    throw new Error(`Tracked Store closure interval is missing: ${storeDbId}`);
  }
  const effectiveEnd =
    interval.endedAt && interval.endedAt < endedAt
      ? interval.endedAt
      : endedAt;
  if (
    interval.endedAt &&
    interval.endedAt.getTime() === effectiveEnd.getTime()
  ) {
    return;
  }
  await tx.storeTemporaryClosureInterval.update({
    where: { id: interval.id },
    data: { endedAt: effectiveEnd },
  });
}

export async function reviseStoreTemporaryClosureEnd(
  tx: StoreHistoryTx,
  storeDbId: string,
  at: Date,
  reason: string | null,
): Promise<void> {
  const interval = await latestClosure(tx, storeDbId, at);
  if (!interval) {
    throw new Error(`Tracked Store closure interval is missing: ${storeDbId}`);
  }
  const plannedEnd = plannedClosureEnd(reason);
  const nextEnd = plannedEnd && plannedEnd > at ? plannedEnd : null;
  if (
    (interval.endedAt === null && nextEnd === null) ||
    (interval.endedAt !== null &&
      nextEnd !== null &&
      interval.endedAt.getTime() === nextEnd.getTime())
  ) {
    return;
  }
  await tx.storeTemporaryClosureInterval.update({
    where: { id: interval.id },
    data: { endedAt: nextEnd },
  });
}
