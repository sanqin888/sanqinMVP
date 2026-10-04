import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  CATALOG_EXTERNAL_AVAILABILITY_SYNC,
  type CatalogExternalAvailabilitySyncPort,
  type CatalogExternalAvailabilitySyncResult,
} from './catalog-external-availability-sync.port';
import {
  CATALOG_AVAILABILITY_READER,
  CatalogAdminService,
  type CatalogAvailabilityMode,
  type CatalogAvailabilityReaderPort,
} from '../../menu/public-api';
import {
  CATALOG_STORE_TIMEZONE,
  type CatalogStoreTimezonePort,
} from './catalog-store-context.port';

@Injectable()
export class CatalogUberAvailabilityOrchestrationService {
  private readonly logger = new Logger(
    CatalogUberAvailabilityOrchestrationService.name,
  );

  constructor(
    private readonly catalog: CatalogAdminService,
    @Inject(CATALOG_AVAILABILITY_READER)
    private readonly catalogAvailability: CatalogAvailabilityReaderPort,
    @Inject(CATALOG_EXTERNAL_AVAILABILITY_SYNC)
    private readonly externalAvailability: CatalogExternalAvailabilitySyncPort,
    @Inject(CATALOG_STORE_TIMEZONE)
    private readonly storeTimezone: CatalogStoreTimezonePort,
  ) {}

  async updateItem(
    storeStableId: string,
    itemStableId: string,
    body: Parameters<CatalogAdminService['updateItem']>[2],
  ) {
    await this.assertUberFixedComponentCompatibility(
      storeStableId,
      itemStableId,
      body,
    );
    await this.catalog.updateItem(storeStableId, itemStableId, body);
    return { ok: true };
  }

  async setItemAvailability(
    storeStableId: string,
    itemStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const timing = await this.resolveAvailabilityTiming(
      storeStableId,
      mode,
    );
    const updated = await this.catalog.setItemAvailability(
      storeStableId,
      itemStableId,
      mode,
      timing,
    );
    const uberSync = await this.syncUberMenuItemAvailabilitySafely(
      storeStableId,
      updated.stableId,
      updated.effectiveAvailability,
      updated.tempUnavailableUntil,
    );

    return {
      stableId: updated.stableId,
      isAvailable: updated.isAvailable,
      visibility: updated.visibility,
      isVisibleOnMainMenu: updated.isVisibleOnMainMenu,
      tempUnavailableUntil: updated.tempUnavailableUntil,
      uberSync: this.presentUberAvailabilitySync(uberSync),
    };
  }

  async setTemplateOptionAvailability(
    storeStableId: string,
    optionStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const timing = await this.resolveAvailabilityTiming(
      storeStableId,
      mode,
    );
    const result = await this.catalog.setTemplateOptionAvailability(
      storeStableId,
      optionStableId,
      mode,
      timing,
    );
    await this.syncUberOptionAvailabilitySafely(
      storeStableId,
      result.availability.stableId,
      result.availability.effectiveAvailability,
      result.availability.tempUnavailableUntil,
    );
    return { ok: true };
  }

  private async resolveAvailabilityTiming(
    storeStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const effectiveAt = new Date();
    if (mode !== 'TEMP_TODAY_OFF') {
      return { effectiveAt, tempUnavailableUntil: null };
    }
    const timezone =
      await this.storeTimezone.getStoreTimezone(storeStableId);
    const storeNow = DateTime.fromJSDate(effectiveAt, { zone: timezone });
    const midnight = storeNow.plus({ days: 1 }).startOf('day').toUTC();
    if (!storeNow.isValid || !midnight.isValid) {
      throw new BadRequestException(
        `Cannot resolve Store-local midnight for timezone ${timezone}`,
      );
    }
    return {
      effectiveAt,
      tempUnavailableUntil: midnight.toJSDate(),
    };
  }

  private async assertUberFixedComponentCompatibility(
    storeStableId: string,
    itemStableId: string,
    body: Parameters<CatalogAdminService['updateItem']>[2],
  ) {
    if (
      body.publishToUberEats === undefined &&
      body.fixedComponents === undefined
    ) {
      return;
    }

    const current =
      await this.catalogAvailability.getMenuItemAvailabilitySnapshot(
        storeStableId,
        itemStableId,
      );
    if (!current) return;

    const nextPublishToUberEats =
      body.publishToUberEats ?? current.publishToUberEats;
    if (!nextPublishToUberEats) return;

    if (body.fixedComponents !== undefined) {
      await this.catalog.validateFixedComponentComposition(
        storeStableId,
        itemStableId,
        body.fixedComponents,
      );
    }

    const nextHasFixedComponents =
      body.fixedComponents === undefined
        ? current.hasFixedComponents
        : body.fixedComponents.length > 0;

    if (nextPublishToUberEats && nextHasFixedComponents) {
      throw new BadRequestException(
        'Fixed combo items cannot be published to Uber Eats until fixed-component modifier context is supported',
      );
    }
  }

  private presentUberAvailabilitySync(
    sync: CatalogExternalAvailabilitySyncResult,
  ) {
    return {
      ...sync,
      stores: sync.stores.map(({ storeStableId, ...store }) => ({
        ...store,
        storeId: storeStableId,
      })),
    };
  }

  private async syncUberMenuItemAvailabilitySafely(
    storeStableId: string,
    menuItemStableId: string,
    isAvailable: boolean,
    suspendUntil: string | null,
  ): Promise<CatalogExternalAvailabilitySyncResult> {
    try {
      const snapshot =
        await this.catalogAvailability.getMenuItemAvailabilitySnapshot(
          storeStableId,
          menuItemStableId,
        );
      return await this.externalAvailability.syncMenuItemAvailability({
        storeStableId,
        menuItemStableId,
        isAvailable,
        publishable: Boolean(
          snapshot &&
          snapshot.visibility === 'PUBLIC' &&
          snapshot.publishToUberEats,
        ),
        suspendUntil,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to sync Uber menu item availability: item=${menuItemStableId}, isAvailable=${isAvailable}, error=${message}`,
      );
      return {
        status: 'FAILED',
        stores: [
          {
            storeStableId: 'unknown',
            status: 'FAILED',
            error: { code: 'UNKNOWN', message, retryable: true },
          },
        ],
      };
    }
  }

  private async syncUberOptionAvailabilitySafely(
    storeStableId: string,
    optionChoiceStableId: string,
    isAvailable: boolean,
    suspendUntil: string | null,
  ) {
    try {
      await this.externalAvailability.syncOptionAvailability({
        storeStableId,
        optionChoiceStableId,
        isAvailable,
        suspendUntil,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to sync Uber option availability: option=${optionChoiceStableId}, isAvailable=${isAvailable}, error=${message}`,
      );
    }
  }
}
