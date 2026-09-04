import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  UBER_EATS_MENU_AVAILABILITY,
  type UberEatsAvailabilitySyncResult,
  type UberEatsMenuAvailabilityPort,
} from '../../integrations/ubereats/public-api';
import {
  CATALOG_AVAILABILITY_READER,
  CatalogAdminService,
  type CatalogAvailabilityMode,
  type CatalogAvailabilityReaderPort,
} from '../../menu/public-api';

@Injectable()
export class CatalogUberAvailabilityOrchestrationService {
  private readonly logger = new Logger(
    CatalogUberAvailabilityOrchestrationService.name,
  );

  constructor(
    private readonly catalog: CatalogAdminService,
    @Inject(CATALOG_AVAILABILITY_READER)
    private readonly catalogAvailability: CatalogAvailabilityReaderPort,
    @Inject(UBER_EATS_MENU_AVAILABILITY)
    private readonly uberEatsService: UberEatsMenuAvailabilityPort,
  ) {}

  async updateItem(
    itemStableId: string,
    body: Parameters<CatalogAdminService['updateItem']>[1],
  ) {
    await this.assertUberFixedComponentCompatibility(itemStableId, body);
    const result = await this.catalog.updateItem(itemStableId, body);
    if (
      body.isAvailable !== undefined ||
      body.tempUnavailableUntil !== undefined
    ) {
      await this.syncUberMenuItemAvailabilitySafely(
        result.availability.stableId,
        result.availability.effectiveAvailability,
        result.availability.tempUnavailableUntil,
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
      result.availability.tempUnavailableUntil,
    );
    return { ok: true };
  }

  private async assertUberFixedComponentCompatibility(
    itemStableId: string,
    body: Parameters<CatalogAdminService['updateItem']>[1],
  ) {
    if (
      body.publishToUberEats === undefined &&
      body.fixedComponents === undefined
    ) {
      return;
    }

    const current =
      await this.catalogAvailability.getMenuItemAvailabilitySnapshot(
        itemStableId,
      );
    if (!current) return;

    const nextPublishToUberEats =
      body.publishToUberEats ?? current.publishToUberEats;
    if (!nextPublishToUberEats) return;

    if (body.fixedComponents !== undefined) {
      await this.catalog.validateFixedComponentComposition(
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
    suspendUntil: string | null,
  ): Promise<UberEatsAvailabilitySyncResult> {
    try {
      const snapshot =
        await this.catalogAvailability.getMenuItemAvailabilitySnapshot(
          menuItemStableId,
        );
      return await this.uberEatsService.syncUberMenuItemAvailability({
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
    suspendUntil: string | null,
  ) {
    try {
      await this.uberEatsService.syncUberOptionItemAvailability({
        optionChoiceStableId,
        isAvailable,
        suspendUntil,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      this.logger.warn(
        `Failed to sync Uber option availability: option=${optionChoiceStableId}, isAvailable=${isAvailable}, error=${message}`,
      );
    }
  }
}
