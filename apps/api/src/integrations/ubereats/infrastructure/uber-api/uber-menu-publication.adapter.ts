import { Injectable } from '@nestjs/common';
import type {
  UberMenuGatewayPort,
  UberMenuImage,
  UberMenuImageProbePort,
} from '../../application/ports/uber-menu-publication.ports';
import { UberMenuGateway } from './uber-resource.gateways';
import { UberImageValidator } from './uber-image.validator';

@Injectable()
export class UberMenuGatewayAdapter implements UberMenuGatewayPort {
  constructor(private readonly gateway: UberMenuGateway) {}
  async uploadMenu(input: Parameters<UberMenuGatewayPort['uploadMenu']>[0]) {
    const response = await this.gateway.request<Record<string, unknown>>({
      path: `/v2/eats/stores/${encodeURIComponent(input.storeId)}/menus`,
      scope: 'eats.store',
      operation: 'uber.menu.upload',
      partitionKey: input.storeId,
      method: 'PUT',
      json: input.payload as unknown as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      uberRequestId: this.string(response.request_id),
      uberResourceId: this.string(response.resource_id ?? response.id),
    };
  }
  async getMenuPublicationStatus(
    input: Parameters<UberMenuGatewayPort['getMenuPublicationStatus']>[0],
  ) {
    const response = await this.gateway.request<Record<string, unknown>>({
      path: `/v2/eats/stores/${encodeURIComponent(input.storeId)}/menus`,
      scope: 'eats.store',
      operation: 'uber.menu.read',
      partitionKey: input.storeId,
      method: 'GET',
    });
    const raw = this.string(response.status)?.toUpperCase();
    const status =
      raw === 'FAILED'
        ? ('FAILED' as const)
        : raw === 'PENDING' || raw === 'PROCESSING'
          ? ('PENDING' as const)
          : ('SUCCEEDED' as const);
    return {
      status,
      uberRequestId: this.string(response.request_id),
      errorCode: this.string(response.error_code),
      errorMessage: this.string(response.error_message),
    };
  }
  private string(value: unknown) {
    return typeof value === 'string' && value ? value : null;
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
