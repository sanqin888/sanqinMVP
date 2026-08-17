import { Inject, Injectable } from '@nestjs/common';
import type {
  UberMenuGatewayPort,
  UberMenuImage,
  UberMenuImageProbePort,
} from '../../application/menu/uber-menu-publication.ports';
import { UberMenuGateway } from './uber-resource.gateways';
import { UberImageValidator } from './uber-image.validator';

const INDEFINITE_SUSPEND_UNTIL = Math.floor(Date.UTC(2099, 0, 1) / 1_000);

@Injectable()
export class UberMenuGatewayAdapter implements UberMenuGatewayPort {
  constructor(
    @Inject(UberMenuGateway)
    private readonly gateway: Pick<UberMenuGateway, 'request'>,
  ) {}
  async uploadMenu(input: Parameters<UberMenuGatewayPort['uploadMenu']>[0]) {
    await this.gateway.request<Record<string, unknown>>({
      path: `/v2/eats/stores/${encodeURIComponent(input.storeId)}/menus`,
      scope: 'eats.store',
      operation: 'uber.menu.upload',
      partitionKey: input.storeId,
      method: 'PUT',
      json: input.payload as unknown as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey,
    });
  }
  async updateItemAvailability(
    input: Parameters<UberMenuGatewayPort['updateItemAvailability']>[0],
  ) {
    const suspendUntil =
      input.suspendUntilEpochSeconds ?? INDEFINITE_SUSPEND_UNTIL;
    await this.gateway.request<Record<string, unknown>>({
      path: `/v2/eats/stores/${encodeURIComponent(input.storeId)}/menus/items/${encodeURIComponent(input.itemId)}`,
      scope: 'eats.store',
      operation: 'uber.menu.item.availability.update',
      partitionKey: input.storeId,
      method: 'POST',
      json: {
        suspension_info: {
          suspension: input.isAvailable
            ? null
            : {
                suspend_until: suspendUntil,
                reason: 'Out of stock',
              },
          overrides: [],
        },
      },
      idempotencyKey: input.idempotencyKey,
    });
  }
}

@Injectable()
export class UberMenuImageProbeAdapter implements UberMenuImageProbePort {
  constructor(private readonly validator: UberImageValidator) {}
  async validateImages(images: UberMenuImage[]) {
    const result = await this.validator.validate({
      menus: [],
      categories: [],
      modifier_groups: [],
      items: images.map((image) => ({
        id: image.itemStableId,
        title: { translations: { en_us: image.itemStableId } },
        price_info: { price: 0, overrides: [] },
        tax_info: { tax_rate: 0, vat_rate_percentage: null },
        modifier_group_ids: { ids: null, overrides: [] },
        suspension_info: null,
        image_url: image.url,
      })),
    });
    return {
      valid: result.issues.length === 0,
      failures: result.issues.map((issue) => ({
        itemStableId: issue.sourceStableId ?? '',
        url:
          images.find((image) => image.itemStableId === issue.sourceStableId)
            ?.url ?? '',
        code: issue.code,
        message: issue.message,
      })),
    };
  }
}
