import { randomUUID } from 'crypto';
import type { UberMenuAvailabilityPort } from './uber-menu-availability.ports';
import type { UberMenuGatewayPort } from './uber-menu-publication.ports';
import type { UberTelemetryPort } from '../shared/uber-telemetry.port';
import type {
  UberMenuAvailabilityCommandPort,
  UberMenuAvailabilityQueryPort,
  UberMenuCatalogAvailabilityQueryPort,
} from './uber-menu-availability.ports';
import type {
  UberAvailabilitySyncResult,
  UberAvailabilitySyncStatus,
} from '../../domain/menu/uber-menu.types';
import { buildUberNodeId } from '../../domain/menu/uber-menu-graph.service';
import { buildUberIdempotencyKey } from '../orders/uber-idempotency-key';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Synchronizes SanQ availability by stableId through Uber's sparse item update API. */
export class UberMenuAvailabilityUseCase implements UberMenuAvailabilityPort {
  constructor(
    private readonly catalogQueries: UberMenuCatalogAvailabilityQueryPort,
    private readonly queries: UberMenuAvailabilityQueryPort,
    private readonly commands: UberMenuAvailabilityCommandPort,
    private readonly gateway: UberMenuGatewayPort,
    private readonly telemetry: Pick<UberTelemetryPort, 'captureEvent'>,
  ) {}

  async syncUberMenuItemAvailability(
    input: Parameters<
      UberMenuAvailabilityPort['syncUberMenuItemAvailability']
    >[0],
  ) {
    const requestedStoreStableId = input.storeStableId?.trim() || undefined;
    const publishable = await this.catalogQueries.isMenuItemPublishable(
      input.menuItemStableId,
    );
    const stores: UberAvailabilitySyncResult['stores'] = [];

    if (publishable) {
      const [mappings, suspendUntil] = await Promise.all([
        this.queries.findProvisionedStores(requestedStoreStableId),
        this.catalogQueries.findMenuItemSuspendUntil(input.menuItemStableId),
      ]);
      for (const mapping of mappings) {
        try {
          await this.updateUberItemAvailability(
            mapping,
            input.menuItemStableId,
            input.isAvailable,
            suspendUntil,
          );
          stores.push({
            storeStableId: mapping.storeStableId,
            uberStoreId: mapping.uberStoreId,
            status: 'SYNCED',
          });
        } catch (error) {
          const message = errorMessage(error);
          await this.commands.createItemPublishFailure({
            storeStableId: mapping.storeStableId,
            uberStoreId: mapping.uberStoreId,
            menuItemStableId: input.menuItemStableId,
            isAvailable: input.isAvailable,
            error: message,
          });
          stores.push({
            storeStableId: mapping.storeStableId,
            uberStoreId: mapping.uberStoreId,
            status: 'FAILED',
            error: message,
          });
        }
      }
    }

    const status = this.summarize(stores);
    await this.telemetry.captureEvent(
      'ubereats_menu_item_availability_sync_requested',
      {
        menuItemStableId: input.menuItemStableId,
        isAvailable: input.isAvailable,
        status,
        stores: stores.map(({ storeStableId, ...store }) => ({
          ...store,
          storeId: storeStableId,
        })),
      },
    );
    return { status, stores };
  }

  async syncUberOptionItemAvailability(
    input: Parameters<
      UberMenuAvailabilityPort['syncUberOptionItemAvailability']
    >[0],
  ) {
    const requestedStoreStableId = input.storeStableId?.trim() || undefined;
    const [mappings, suspendUntil] = await Promise.all([
      this.queries.findProvisionedStores(requestedStoreStableId),
      this.catalogQueries.findOptionSuspendUntil(input.optionChoiceStableId),
    ]);
    const stores: UberAvailabilitySyncResult['stores'] = [];
    for (const mapping of mappings) {
      try {
        await this.updateUberItemAvailability(
          mapping,
          input.optionChoiceStableId,
          input.isAvailable,
          suspendUntil,
        );
        stores.push({
          storeStableId: mapping.storeStableId,
          uberStoreId: mapping.uberStoreId,
          status: 'SYNCED',
        });
      } catch (error) {
        stores.push({
          storeStableId: mapping.storeStableId,
          uberStoreId: mapping.uberStoreId,
          status: 'FAILED',
          error: errorMessage(error),
        });
      }
    }
    const status = this.summarize(stores);
    await this.telemetry.captureEvent(
      'ubereats_option_item_availability_synced',
      {
        storeId: requestedStoreStableId ?? null,
        optionChoiceStableId: input.optionChoiceStableId,
        isAvailable: input.isAvailable,
        status,
        stores: stores.map(({ storeStableId, ...store }) => ({
          ...store,
          storeId: storeStableId,
        })),
      },
    );
    return { status, stores };
  }

  private async updateUberItemAvailability(
    mapping: { storeStableId: string; uberStoreId: string },
    stableId: string,
    isAvailable: boolean,
    suspendUntil: Date | null,
  ) {
    const itemId = buildUberNodeId('item', mapping.storeStableId, stableId);
    const taskId = randomUUID();
    const suspendUntilEpochSeconds =
      !isAvailable && suspendUntil && suspendUntil.getTime() > Date.now()
        ? Math.floor(suspendUntil.getTime() / 1_000)
        : null;
    await this.gateway.updateItemAvailability({
      storeId: mapping.uberStoreId,
      itemId,
      isAvailable,
      suspendUntilEpochSeconds,
      idempotencyKey: buildUberIdempotencyKey({
        taskId,
        resourceId: `${mapping.uberStoreId}:${itemId}`,
        action: 'UPDATE_ITEM_AVAILABILITY',
        businessVersion: isAvailable
          ? 'AVAILABLE'
          : suspendUntilEpochSeconds
            ? `UNAVAILABLE_UNTIL_${suspendUntilEpochSeconds}`
            : 'UNAVAILABLE',
      }),
    });
  }

  private summarize(
    stores: UberAvailabilitySyncResult['stores'],
  ): UberAvailabilitySyncStatus {
    if (stores.some(({ status }) => status === 'FAILED')) return 'FAILED';
    if (stores.some(({ status }) => status === 'PENDING')) return 'PENDING';
    if (stores.some(({ status }) => status === 'SYNCED')) return 'SYNCED';
    return 'SKIPPED_NOT_PUBLISHED';
  }
}
