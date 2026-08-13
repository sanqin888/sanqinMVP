import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberItemChannelConfigCommandPort,
  UberOptionItemConfigCommandPort,
} from '../../application/menu/uber-menu-draft.ports';
import type {
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';
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

  async upsertUberItemChannelConfig(input: UpsertPriceBookItemInput) {
    const normalizedStoreId = normalizeUberStoreId(input.storeId);

    const row = await this.prisma.uberItemChannelConfig.upsert({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        menuItemStableId: input.menuItemStableId,
        priceCents: Math.max(1, Math.round(input.priceCents)),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
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
      },
    });

    await this.telemetry.captureEvent(
      'ubereats_price_book_item_upserted',
      {
        storeId: normalizedStoreId,
        menuItemStableId: input.menuItemStableId,
        priceCents: row.priceCents,
        isAvailable: row.isAvailable,
      },
      {
        eventId: this.eventKey(
          'item',
          normalizedStoreId,
          input.menuItemStableId,
          {
            priceCents: row.priceCents,
            isAvailable: row.isAvailable,
            displayName: row.displayName,
            displayDescription: row.displayDescription,
          },
        ),
      },
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: row,
    };
  }

  async upsertUberOptionItemConfig(input: UpsertOptionItemConfigInput) {
    const normalizedStoreId = normalizeUberStoreId(input.storeId);

    const row = await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: input.optionChoiceStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        optionChoiceStableId: input.optionChoiceStableId,
        priceDeltaCents: Math.round(input.priceDeltaCents ?? 0),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
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
      },
    });

    await this.telemetry.captureEvent(
      'ubereats_option_item_config_upserted',
      {
        storeId: normalizedStoreId,
        optionChoiceStableId: input.optionChoiceStableId,
        priceDeltaCents: row.priceDeltaCents,
        isAvailable: row.isAvailable,
      },
      {
        eventId: this.eventKey(
          'option',
          normalizedStoreId,
          input.optionChoiceStableId,
          {
            priceDeltaCents: row.priceDeltaCents,
            isAvailable: row.isAvailable,
            displayName: row.displayName,
            displayDescription: row.displayDescription,
          },
        ),
      },
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: row,
    };
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
