import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberItemChannelConfigCommandPort,
  UberOptionItemConfigCommandPort,
} from '../../application/menu/uber-menu-draft.ports';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';
import { readUberPreparationType } from '../../domain/menu/uber-menu.types';
import { UberTelemetryService } from './uber-telemetry.service';

@Injectable()
export class UberMenuConfigWritePrismaAdapter
  implements UberItemChannelConfigCommandPort, UberOptionItemConfigCommandPort
{
  private readonly telemetry: UberTelemetryService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
  }

  async upsertUberItemChannelConfig(
    command: import('../../application/menu/uber-menu-draft.ports').UberItemConfigCommand,
  ) {
    const input = command.payload;
    const normalizedStoreId = await this.canonicalStoreId(
      command.resourceKey.storeId,
    );

    const row = await this.prisma.uberItemChannelConfig.upsert({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: command.resourceKey.menuItemStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        menuItemStableId: command.resourceKey.menuItemStableId,
        priceCents: Math.max(1, Math.round(input.priceCents)),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
        preparationType: input.preparationType ?? null,
      },
      update: {
        priceCents: Math.max(1, Math.round(input.priceCents)),
        ...(typeof input.isAvailable === 'boolean'
          ? { isAvailable: input.isAvailable }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.displayDescription !== undefined
          ? { displayDescription: input.displayDescription?.trim() || null }
          : {}),
        ...(input.preparationType !== undefined
          ? { preparationType: input.preparationType }
          : {}),
      },
    });

    await this.telemetry.captureEvent(
      'ubereats_price_book_item_upserted',
      {
        storeId: normalizedStoreId,
        menuItemStableId: input.menuItemStableId,
        priceCents: row.priceCents,
        isAvailable: row.isAvailable,
        preparationType: row.preparationType,
      },
      {
        eventId: this.eventKey(
          'item',
          normalizedStoreId,
          command.resourceKey.menuItemStableId,
          {
            priceCents: row.priceCents,
            isAvailable: row.isAvailable,
            displayName: row.displayName,
            displayDescription: row.displayDescription,
            preparationType: row.preparationType,
          },
        ),
      },
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: {
        ...row,
        preparationType: readUberPreparationType(row.preparationType),
      },
    };
  }

  async upsertUberOptionItemConfig(
    command: import('../../application/menu/uber-menu-draft.ports').UberOptionConfigCommand,
  ) {
    const input = command.payload;
    const normalizedStoreId = await this.canonicalStoreId(
      command.resourceKey.storeId,
    );

    const row = await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: command.resourceKey.optionChoiceStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        optionChoiceStableId: command.resourceKey.optionChoiceStableId,
        priceDeltaCents: Math.round(input.priceDeltaCents ?? 0),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
        preparationType: input.preparationType ?? null,
      },
      update: {
        ...(input.priceDeltaCents !== undefined
          ? { priceDeltaCents: Math.round(input.priceDeltaCents) }
          : {}),
        ...(typeof input.isAvailable === 'boolean'
          ? { isAvailable: input.isAvailable }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.displayDescription !== undefined
          ? { displayDescription: input.displayDescription?.trim() || null }
          : {}),
        ...(input.preparationType !== undefined
          ? { preparationType: input.preparationType }
          : {}),
      },
    });

    await this.telemetry.captureEvent(
      'ubereats_option_item_config_upserted',
      {
        storeId: normalizedStoreId,
        optionChoiceStableId: input.optionChoiceStableId,
        priceDeltaCents: row.priceDeltaCents,
        isAvailable: row.isAvailable,
        preparationType: row.preparationType,
      },
      {
        eventId: this.eventKey(
          'option',
          normalizedStoreId,
          command.resourceKey.optionChoiceStableId,
          {
            priceDeltaCents: row.priceDeltaCents,
            isAvailable: row.isAvailable,
            displayName: row.displayName,
            displayDescription: row.displayDescription,
            preparationType: row.preparationType,
          },
        ),
      },
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: {
        ...row,
        preparationType: readUberPreparationType(row.preparationType),
      },
    };
  }

  private async canonicalStoreId(storeId?: string) {
    const requestedStoreId = normalizeUberStoreId(storeId);
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        isProvisioned: true,
        OR: [
          { posExternalStoreId: requestedStoreId },
          { uberStoreId: requestedStoreId },
        ],
      },
      select: { posExternalStoreId: true },
    });
    return mapping?.posExternalStoreId?.trim() || requestedStoreId;
  }

  private eventKey(
    kind: string,
    storeId: string,
    entityId: string,
    state: Record<string, unknown>,
  ): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex');
    return `uber-menu:${kind}:${storeId}:${entityId}:${digest}`;
  }
}
