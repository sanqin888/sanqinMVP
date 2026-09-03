import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '../../common/app-logger';
import {
  UBER_EATS_MENU_AVAILABILITY,
  type UberEatsAvailabilitySyncResult,
  type UberEatsMenuAvailabilityPort,
} from '../../integrations/ubereats/public-api';
import {
  CatalogAdminService,
  type CatalogAvailabilityMode,
} from '../../menu/public-api';

@Injectable()
export class AdminMenuAvailabilityOrchestrationService {
  private readonly logger = new AppLogger(
    AdminMenuAvailabilityOrchestrationService.name,
  );

  constructor(
    private readonly catalog: CatalogAdminService,
    @Inject(UBER_EATS_MENU_AVAILABILITY)
    private readonly uberEatsService: UberEatsMenuAvailabilityPort,
  ) {}

  async updateItem(
    itemStableId: string,
    body: Parameters<CatalogAdminService['updateItem']>[1],
  ) {
    const result = await this.catalog.updateItem(itemStableId, body);
    if (
      body.isAvailable !== undefined ||
      body.tempUnavailableUntil !== undefined
    ) {
      await this.syncUberMenuItemAvailabilitySafely(
        result.availability.stableId,
        result.availability.effectiveAvailability,
      );
    }
    return { ok: true };
  }

  async setItemAvailability(
    itemStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const updated = await this.catalog.setItemAvailability(itemStableId, mode);
    const uberSync = await this.syncUberMenuItemAvailabilitySafely(
      updated.stableId,
      updated.effectiveAvailability,
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
    optionStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const result = await this.catalog.setTemplateOptionAvailability(
      optionStableId,
      mode,
    );
    await this.syncUberOptionAvailabilitySafely(
      result.availability.stableId,
      result.availability.effectiveAvailability,
    );
    return { ok: true };
  }

  private presentUberAvailabilitySync(sync: UberEatsAvailabilitySyncResult) {
    return {
      ...sync,
      stores: sync.stores.map(({ storeStableId, ...store }) => ({
        ...store,
        storeId: storeStableId,
      })),
    };
  }

  private async syncUberMenuItemAvailabilitySafely(
    menuItemStableId: string,
    isAvailable: boolean,
  ): Promise<UberEatsAvailabilitySyncResult> {
    try {
      return await this.uberEatsService.syncUberMenuItemAvailability({
        menuItemStableId,
        isAvailable,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
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
    optionChoiceStableId: string,
    isAvailable: boolean,
  ) {
    try {
      await this.uberEatsService.syncUberOptionItemAvailability({
        optionChoiceStableId,
        isAvailable,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      this.logger.warn(
        `Failed to sync Uber option availability: option=${optionChoiceStableId}, isAvailable=${isAvailable}, error=${message}`,
      );
    }
  }
}
