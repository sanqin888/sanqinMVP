import type {
  UberStoreDiscoveryResult,
  UberStoreIntegrationConfig,
  UberStoreProvisionResult,
} from '../../application/merchant/uber-merchant-api.ports';
import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';
import { mapUberGatewayFailure } from './uber-error.mapper';

type WireObject = Record<string, unknown>;

const asObject = (value: unknown): WireObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as WireObject)
    : null;

const readString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const readBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const mappingFailure = (
  operation:
    | 'merchant.discover-stores'
    | 'merchant.provision-store'
    | 'merchant.retrieve-integration-config',
  code:
    | 'UBER_STORE_DISCOVERY_MAPPING_FAILED'
    | 'UBER_STORE_PROVISION_MAPPING_FAILED'
    | 'UBER_STORE_INTEGRATION_CONFIG_MAPPING_FAILED',
  reason: string,
) =>
  mapUberGatewayFailure({
    kind: 'mapping',
    code,
    operation,
    reason,
  });

/**
 * Discovery wire policy: `stores` and every member's `store_id` are required.
 * Optional name/location/timezone/POS fields default to null, while
 * `integrationEnabled` defaults to false. All other upstream fields are ignored.
 */
export function mapUberStoreDiscoveryWire(
  value: unknown,
): UberStoreDiscoveryResult {
  const root = asObject(value);
  if (!root || !Array.isArray(root.stores))
    throw mappingFailure(
      'merchant.discover-stores',
      'UBER_STORE_DISCOVERY_MAPPING_FAILED',
      'Uber 门店列表响应缺少 stores 数组',
    );

  const stores: UberMerchantStore[] = root.stores.map((candidate, index) => {
    const store = asObject(candidate);
    if (!store)
      throw mappingFailure(
        'merchant.discover-stores',
        'UBER_STORE_DISCOVERY_MAPPING_FAILED',
        `Uber 门店列表第 ${index} 项不是 object`,
      );
    const storeId = readString(store.store_id);
    if (!storeId)
      throw mappingFailure(
        'merchant.discover-stores',
        'UBER_STORE_DISCOVERY_MAPPING_FAILED',
        `Uber 门店列表第 ${index} 项缺少 store_id`,
      );

    const location = asObject(store.location) ?? asObject(store.address);
    const pos = asObject(store.pos_data);
    return {
      storeId,
      storeName: readString(store.name, store.store_name),
      locationSummary: readString(
        store.location_summary,
        location?.formatted_address,
        [location?.address_line_one, location?.city, location?.country]
          .filter(
            (part): part is string =>
              typeof part === 'string' && Boolean(part.trim()),
          )
          .join(', '),
      ),
      integrationEnabled: pos?.integration_enabled === true,
      posExternalStoreId: readString(
        pos?.order_manager_client_id,
        pos?.pos_external_store_id,
        store.pos_external_store_id,
      ),
      timezone: readString(
        store.timezone,
        store.time_zone,
        location?.timezone,
        location?.time_zone,
      ),
    };
  });

  return { stores };
}

/**
 * Provision wire policy: the requested store id is authoritative because a
 * successful upstream response may have an empty body. Optional response
 * fields default to null; unknown upstream fields are deliberately ignored.
 */
export function mapUberStoreProvisionWire(
  value: unknown,
  storeId: string,
): UberStoreProvisionResult {
  const raw = asObject(value);
  const requestedStoreId = readString(storeId);
  if (!requestedStoreId)
    throw mappingFailure(
      'merchant.provision-store',
      'UBER_STORE_PROVISION_MAPPING_FAILED',
      'Uber 门店配置请求缺少 storeId',
    );

  const store = asObject(raw?.store);
  const location = asObject(raw?.location) ?? asObject(raw?.address);
  return {
    storeId: requestedStoreId,
    status: readString(raw?.status),
    storeName: readString(store?.name, raw?.store_name),
    locationSummary: readString(
      raw?.location_summary,
      location?.formatted_address,
    ),
    posExternalStoreId: readString(
      raw?.pos_external_store_id,
      asObject(raw?.pos_data)?.order_manager_client_id,
    ),
  };
}

/** Integration config is an explicit wire contract and must not leak snake_case upstream fields. */
export function mapUberStoreIntegrationConfigWire(
  value: unknown,
  requestedStoreId: string,
): UberStoreIntegrationConfig {
  const raw = asObject(value);
  const storeId = readString(raw?.store_id);
  if (!raw || !storeId || storeId !== requestedStoreId.trim())
    throw mappingFailure(
      'merchant.retrieve-integration-config',
      'UBER_STORE_INTEGRATION_CONFIG_MAPPING_FAILED',
      'Uber integration config 响应缺少或返回了不匹配的 store_id',
    );

  const requests = asObject(raw.allowed_customer_requests);
  return {
    storeId,
    integrationEnabled: readBoolean(raw.integration_enabled),
    allowedCustomerRequests: requests
      ? {
          allowSingleUseItemsRequests: readBoolean(
            requests.allow_single_use_items_requests,
          ),
          allowSpecialInstructionRequests: readBoolean(
            requests.allow_special_instruction_requests,
          ),
        }
      : null,
    integratorBrandId: readString(raw.integrator_brand_id),
    integratorStoreId: readString(raw.integrator_store_id),
    isOrderManager: readBoolean(raw.is_order_manager),
    merchantStoreId: readString(raw.merchant_store_id, raw.partner_store_id),
    requireManualAcceptance: readBoolean(raw.require_manual_acceptance),
    storeConfigurationData: readString(raw.store_configuration_data),
    webhooksConfig: asObject(raw.webhooks_config),
    onlineStatus: readString(raw.online_status),
    orderReleaseEnabled: readBoolean(raw.order_release_enabled),
    autoAcceptEnabled: readBoolean(raw.auto_accept_enabled),
    posMetadata: asObject(raw.pos_metadata),
    orderManagerClientId: readString(raw.order_manager_client_id),
    isOrderManagerPending: readBoolean(raw.is_order_manager_pending),
  };
}
