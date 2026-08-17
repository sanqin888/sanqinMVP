import type { UberMenuAvailabilityPort } from './uber-menu-availability.ports';
import type { UberMenuPublishCommandPort } from './uber-menu-publication.ports';
import type { UberTelemetryPort } from '../shared/uber-telemetry.port';
import type {
  UberMenuAvailabilityCommandPort,
  UberMenuAvailabilityQueryPort,
} from './uber-menu-availability.ports';
import type {
  UberAvailabilitySyncResult,
  UberAvailabilitySyncStatus,
} from '../../domain/menu/uber-menu.types';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Synchronizes SanQ availability by stableId and republishes the affected Uber store. */
export class UberMenuAvailabilityUseCase implements UberMenuAvailabilityPort {
  constructor(
    private readonly queries: UberMenuAvailabilityQueryPort,
    private readonly commands: UberMenuAvailabilityCommandPort,
    private readonly publish: UberMenuPublishCommandPort,
    private readonly telemetry: Pick<UberTelemetryPort, 'captureEvent'>,
  ) {}

  async syncUberMenuItemAvailability(
    input: Parameters<
      UberMenuAvailabilityPort['syncUberMenuItemAvailability']
    >[0],
  ) {
    const requestedStoreId = input.storeId?.trim() || undefined;
    const publishable = await this.queries.isMenuItemPublishable(
      input.menuItemStableId,
    );
    const stores: UberAvailabilitySyncResult['stores'] = [];

    if (publishable) {
      const mappings =
        await this.queries.findProvisionedStores(requestedStoreId);
      for (const mapping of mappings) {
        await this.commands.setItemAvailability(
          mapping.storeId,
          input.menuItemStableId,
          input.isAvailable,
        );
        try {
          const result = await this.publish.execute({
            storeId: mapping.storeId,
            dryRun: false,
            taxRateConfirmed: true,
            timezoneConfirmed: true,
          });
          stores.push({
            storeId: mapping.storeId,
            uberStoreId: mapping.uberStoreId,
            status: 'PENDING',
            versionStableId: result.versionStableId,
          });
        } catch (error) {
          const message = errorMessage(error);
          await this.commands.createItemPublishFailure({
            storeId: mapping.storeId,
            uberStoreId: mapping.uberStoreId,
            menuItemStableId: input.menuItemStableId,
            isAvailable: input.isAvailable,
            error: message,
          });
          stores.push({
            storeId: mapping.storeId,
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
        stores,
      },
    );
    return { status, stores };
  }

  async syncUberOptionItemAvailability(
    input: Parameters<
      UberMenuAvailabilityPort['syncUberOptionItemAvailability']
    >[0],
  ) {
    const requestedStoreId = input.storeId?.trim() || undefined;
    const mappings = await this.queries.findProvisionedStores(requestedStoreId);
    const stores: UberAvailabilitySyncResult['stores'] = [];
    for (const mapping of mappings) {
      await this.commands.setOptionAvailability(
        mapping.uberStoreId,
        input.optionChoiceStableId,
        input.isAvailable,
      );
      try {
        const result = await this.publish.execute({
          storeId: mapping.uberStoreId,
          dryRun: false,
          taxRateConfirmed: true,
          timezoneConfirmed: true,
        });
        stores.push({
          storeId: mapping.uberStoreId,
          uberStoreId: mapping.uberStoreId,
          status: 'PENDING',
          versionStableId: result.versionStableId,
        });
      } catch (error) {
        stores.push({
          storeId: mapping.uberStoreId,
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
        storeId: requestedStoreId ?? null,
        optionChoiceStableId: input.optionChoiceStableId,
        isAvailable: input.isAvailable,
        status,
        stores,
      },
    );
    return { status, stores };
  }

  private summarize(
    stores: UberAvailabilitySyncResult['stores'],
  ): UberAvailabilitySyncStatus {
    if (stores.some(({ status }) => status === 'FAILED')) return 'FAILED';
    if (stores.some(({ status }) => status === 'PENDING')) return 'PENDING';
    return 'SKIPPED_NOT_PUBLISHED';
  }
}
