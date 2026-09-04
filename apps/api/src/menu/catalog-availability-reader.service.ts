import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CatalogAvailabilityReaderPort,
  CatalogMenuItemAvailabilitySnapshot,
  CatalogOptionAvailabilitySnapshot,
} from './catalog-availability-reader.contract';

const toIso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class CatalogAvailabilityReaderService
  implements CatalogAvailabilityReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getMenuItemAvailabilitySnapshot(
    menuItemStableId: string,
  ): Promise<CatalogMenuItemAvailabilitySnapshot | null> {
    const stableId = menuItemStableId.trim();
    if (!stableId) return null;

    const item = await this.prisma.menuItem.findFirst({
      where: { stableId, deletedAt: null },
      select: {
        stableId: true,
        visibility: true,
        publishToUberEats: true,
        tempUnavailableUntil: true,
        fixedComponents: { select: { id: true } },
      },
    });
    if (!item) return null;

    return {
      stableId: item.stableId,
      visibility: item.visibility,
      publishToUberEats: item.publishToUberEats,
      tempUnavailableUntil: toIso(item.tempUnavailableUntil),
      hasFixedComponents: item.fixedComponents.length > 0,
    };
  }

  async getOptionAvailabilitySnapshot(
    optionChoiceStableId: string,
  ): Promise<CatalogOptionAvailabilitySnapshot | null> {
    const stableId = optionChoiceStableId.trim();
    if (!stableId) return null;

    const option = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { stableId: true, tempUnavailableUntil: true },
    });
    if (!option) return null;

    return {
      stableId: option.stableId,
      tempUnavailableUntil: toIso(option.tempUnavailableUntil),
    };
  }
}
