import type { Prisma } from '@prisma/client';

type CatalogHistoryTx = Prisma.TransactionClient;

type CatalogAvailabilityItemSnapshot = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  isAvailable: boolean;
  tempUnavailableUntil: Date | null;
};

export function isCatalogItemUnavailableAt(
  item: Pick<CatalogAvailabilityItemSnapshot, 'isAvailable' | 'tempUnavailableUntil'>,
  at: Date,
): boolean {
  return (
    !item.isAvailable ||
    (item.tempUnavailableUntil !== null &&
      item.tempUnavailableUntil.getTime() > at.getTime())
  );
}

export async function initializeCatalogAvailabilityHistory(
  tx: CatalogHistoryTx,
  storeStableId: string,
  trackingStartedAt: Date,
): Promise<boolean> {
  const inserted = await tx.catalogAvailabilityHistoryState.createMany({
    data: [{ storeStableId, trackingStartedAt }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false;

  const items = await tx.menuItem.findMany({
    where: {
      deletedAt: null,
      category: { storeStableId, deletedAt: null },
    },
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      isAvailable: true,
      tempUnavailableUntil: true,
    },
  });
  const unavailable = items.filter((item) =>
    isCatalogItemUnavailableAt(item, trackingStartedAt),
  );
  if (unavailable.length > 0) {
    await tx.catalogItemUnavailableInterval.createMany({
      data: unavailable.map((item) => ({
        storeStableId,
        menuItemStableId: item.stableId,
        nameEnSnapshot: item.nameEn,
        nameZhSnapshot: item.nameZh,
        startedAt: trackingStartedAt,
        endedAt: item.isAvailable ? item.tempUnavailableUntil : null,
      })),
    });
  }
  return true;
}

async function latestTrackedInterval(
  tx: CatalogHistoryTx,
  storeStableId: string,
  menuItemStableId: string,
  at: Date,
) {
  return tx.catalogItemUnavailableInterval.findFirst({
    where: {
      storeStableId,
      menuItemStableId,
      startedAt: { lte: at },
    },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, endedAt: true },
  });
}

export async function captureCatalogAvailabilityTransition(
  tx: CatalogHistoryTx,
  input: {
    storeStableId: string;
    item: Pick<CatalogAvailabilityItemSnapshot, 'stableId' | 'nameEn' | 'nameZh'>;
    wasUnavailable: boolean;
    isUnavailable: boolean;
    effectiveAt: Date;
    unavailableUntil: Date | null;
  },
): Promise<void> {
  if (!input.wasUnavailable && !input.isUnavailable) return;

  if (!input.wasUnavailable && input.isUnavailable) {
    await tx.catalogItemUnavailableInterval.create({
      data: {
        storeStableId: input.storeStableId,
        menuItemStableId: input.item.stableId,
        nameEnSnapshot: input.item.nameEn,
        nameZhSnapshot: input.item.nameZh,
        startedAt: input.effectiveAt,
        endedAt: input.unavailableUntil,
      },
    });
    return;
  }

  const interval = await latestTrackedInterval(
    tx,
    input.storeStableId,
    input.item.stableId,
    input.effectiveAt,
  );
  if (!interval) {
    throw new Error(
      `Tracked Catalog unavailable interval is missing: store=${input.storeStableId} item=${input.item.stableId}`,
    );
  }

  const nextEnd = input.isUnavailable
    ? input.unavailableUntil
    : input.effectiveAt;
  if (
    (interval.endedAt === null && nextEnd === null) ||
    (interval.endedAt !== null &&
      nextEnd !== null &&
      interval.endedAt.getTime() === nextEnd.getTime())
  ) {
    return;
  }
  await tx.catalogItemUnavailableInterval.update({
    where: { id: interval.id },
    data: { endedAt: nextEnd },
  });
}
