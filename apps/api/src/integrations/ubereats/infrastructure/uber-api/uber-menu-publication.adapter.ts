import { Inject, Injectable } from '@nestjs/common';
import type {
  UberMenuGatewayPort,
  UberMenuImage,
  UberMenuImageProbePort,
  UberRetrievedMenu,
  UberRetrievedMenuItem,
  UberRetrievedMenuModifierGroup,
} from '../../application/menu/uber-menu-publication.ports';
import { UberMenuGateway } from './uber-resource.gateways';
import { UberImageValidator } from './uber-image.validator';
import { mapUberGatewayFailure } from './uber-error.mapper';

const INDEFINITE_SUSPEND_UNTIL = Math.floor(Date.UTC(2099, 0, 1) / 1_000);

type MenuWireObject = Record<string, unknown>;
const asMenuWireObject = (value: unknown): MenuWireObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as MenuWireObject)
    : null;
const readMenuWireString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const menuMappingFailure = (reason: string) =>
  mapUberGatewayFailure({
    kind: 'mapping',
    operation: 'uber.menu.retrieve',
    code: 'UBER_MENU_RETRIEVAL_MAPPING_FAILED',
    reason,
  });
const requiredMenuWireObjects = (
  root: MenuWireObject,
  key: 'menus' | 'categories' | 'items' | 'modifier_groups',
): MenuWireObject[] => {
  const value = root[key];
  if (!Array.isArray(value))
    throw menuMappingFailure(`Uber Menu GET 响应缺少 ${key} 数组`);
  return value.map((candidate, index) => {
    const object = asMenuWireObject(candidate);
    if (!object)
      throw menuMappingFailure(`Uber Menu GET ${key}[${index}] 不是 object`);
    return object;
  });
};
const requiredMenuWireId = (value: MenuWireObject, path: string): string => {
  const id = readMenuWireString(value.id);
  if (!id) throw menuMappingFailure(`Uber Menu GET ${path} 缺少 id`);
  return id;
};
const menuWireStringIds = (value: unknown, path: string): string[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value))
    throw menuMappingFailure(`Uber Menu GET ${path} 必须为 id 数组或 null`);
  return value.map((candidate, index) => {
    const id = readMenuWireString(candidate);
    if (!id)
      throw menuMappingFailure(`Uber Menu GET ${path}[${index}] 缺少合法 id`);
    return id;
  });
};
const menuWireItemAvailability = (
  item: MenuWireObject,
  nowEpochSeconds: number,
): boolean => {
  const suspensionInfo = asMenuWireObject(item.suspension_info);
  if (!suspensionInfo || suspensionInfo.suspension === null) return true;
  const suspension = asMenuWireObject(suspensionInfo.suspension);
  if (!suspension) return true;
  const suspendUntil = suspension.suspend_until;
  return !(
    typeof suspendUntil === 'number' &&
    Number.isFinite(suspendUntil) &&
    suspendUntil > nowEpochSeconds
  );
};
const mapRetrievedMenuItem = (
  item: MenuWireObject,
  index: number,
  nowEpochSeconds: number,
): UberRetrievedMenuItem => {
  const id = requiredMenuWireId(item, `items[${index}]`);
  const priceInfo = asMenuWireObject(item.price_info);
  const price = priceInfo?.price;
  if (!Number.isInteger(price) || (price as number) < 0)
    throw menuMappingFailure(
      `Uber Menu GET items[${index}].price_info.price 缺少非负整数价格`,
    );
  const modifierGroupIds = asMenuWireObject(item.modifier_group_ids);
  const taxInfo = asMenuWireObject(item.tax_info);
  const taxRate = taxInfo?.tax_rate;
  const taxLabelInfo = asMenuWireObject(item.tax_label_info);
  const taxLabelDefault = asMenuWireObject(taxLabelInfo?.default_value);
  return {
    id,
    priceCents: price as number,
    isAvailable: menuWireItemAvailability(item, nowEpochSeconds),
    modifierGroupIds: menuWireStringIds(
      modifierGroupIds?.ids,
      `items[${index}].modifier_group_ids.ids`,
    ),
    taxRatePercentage:
      typeof taxRate === 'number' && Number.isFinite(taxRate) ? taxRate : null,
    taxLabels: menuWireStringIds(
      taxLabelDefault?.labels,
      `items[${index}].tax_label_info.default_value.labels`,
    ),
  };
};
const mapRetrievedMenuModifierGroup = (
  group: MenuWireObject,
  index: number,
): UberRetrievedMenuModifierGroup => {
  const id = requiredMenuWireId(group, `modifier_groups[${index}]`);
  const options = group.modifier_options;
  if (!Array.isArray(options))
    throw menuMappingFailure(
      `Uber Menu GET modifier_groups[${index}].modifier_options 缺少数组`,
    );
  return {
    id,
    optionItemIds: options.map((candidate, optionIndex) => {
      const option = asMenuWireObject(candidate);
      const optionId = option ? readMenuWireString(option.id) : null;
      if (!optionId)
        throw menuMappingFailure(
          `Uber Menu GET modifier_groups[${index}].modifier_options[${optionIndex}] 缺少 id`,
        );
      return optionId;
    }),
  };
};
const mapUberRetrievedMenuWire = (
  value: unknown,
  requestedStoreId: string,
  nowEpochSeconds = Math.floor(Date.now() / 1_000),
): UberRetrievedMenu => {
  const root = asMenuWireObject(value);
  const storeId = requestedStoreId.trim();
  if (!root || !storeId)
    throw menuMappingFailure('Uber Menu GET 响应无效或请求缺少 storeId');
  const menus = requiredMenuWireObjects(root, 'menus');
  const categories = requiredMenuWireObjects(root, 'categories');
  const items = requiredMenuWireObjects(root, 'items');
  const modifierGroups = requiredMenuWireObjects(root, 'modifier_groups');
  const displayOptions = asMenuWireObject(root.display_options);
  return {
    storeId,
    menuIds: menus.map((menu, index) =>
      requiredMenuWireId(menu, `menus[${index}]`),
    ),
    categoryIds: categories.map((category, index) =>
      requiredMenuWireId(category, `categories[${index}]`),
    ),
    items: items.map((item, index) =>
      mapRetrievedMenuItem(item, index, nowEpochSeconds),
    ),
    modifierGroups: modifierGroups.map(mapRetrievedMenuModifierGroup),
    disableItemInstructions:
      typeof displayOptions?.disable_item_instructions === 'boolean'
        ? displayOptions.disable_item_instructions
        : null,
  };
};

@Injectable()
export class UberMenuGatewayAdapter implements UberMenuGatewayPort {
  constructor(
    @Inject(UberMenuGateway)
    private readonly gateway: Pick<UberMenuGateway, 'request'>,
  ) {}
  async retrieveMenu(storeId: string) {
    const raw = await this.gateway.request<Record<string, unknown>>({
      path: `/v2/eats/stores/${encodeURIComponent(storeId)}/menus`,
      scope: 'eats.store',
      operation: 'uber.menu.retrieve',
      partitionKey: storeId,
      method: 'GET',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    return mapUberRetrievedMenuWire(raw, storeId);
  }
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
      display_options: { disable_item_instructions: false },
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
