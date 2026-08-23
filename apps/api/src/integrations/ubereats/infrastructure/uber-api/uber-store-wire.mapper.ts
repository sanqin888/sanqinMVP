import type {
  UberStoreDiscoveryResult,
  UberStoreIntegrationConfig,
  UberStoreIntegrationJsonObject,
  UberStorePrepTime,
  UberStoreProvisionResult,
  UberStoreStatus,
} from '../../application/merchant/uber-merchant-api.ports';
import type { UberJsonValue } from '../../application/shared/uber-json-value';
import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';
import { mapUberGatewayFailure } from './uber-error.mapper';

type WireObject = Record<string, unknown>;

const asObject = (value: unknown): WireObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as WireObject)
    : null;

const asJsonValue = (value: unknown): UberJsonValue | undefined => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) {
    const mapped = value.map(asJsonValue);
    return mapped.some((entry) => entry === undefined)
      ? undefined
      : (mapped as UberJsonValue[]);
  }
  const object = asObject(value);
  if (!object) return undefined;
  const mapped: UberStoreIntegrationJsonObject = {};
  for (const [key, entry] of Object.entries(object)) {
    const json = asJsonValue(entry);
    if (json === undefined) return undefined;
    mapped[key] = json;
  }
  return mapped;
};

const asJsonObject = (
  value: unknown,
): UberStoreIntegrationJsonObject | null => {
  const json = asJsonValue(value);
  return json !== null && typeof json === 'object' && !Array.isArray(json)
    ? json
    : null;
};

const readString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const readBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const mappingFailure = (
  operation:
    | 'merchant.discover-stores'
    | 'merchant.provision-store'
    | 'merchant.retrieve-integration-config'
    | 'merchant.retrieve-store-status'
    | 'merchant.update-store-prep-time',
  code:
    | 'UBER_STORE_DISCOVERY_MAPPING_FAILED'
    | 'UBER_STORE_PROVISION_MAPPING_FAILED'
    | 'UBER_STORE_INTEGRATION_CONFIG_MAPPING_FAILED'
    | 'UBER_STORE_STATUS_MAPPING_FAILED'
    | 'UBER_STORE_PREP_TIME_MAPPING_FAILED',
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
      posExternalStoreId: readString(pos?.integrator_store_id),
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
      raw?.integrator_store_id,
      asObject(raw?.pos_data)?.integrator_store_id,
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
    webhooksConfig: asJsonObject(raw.webhooks_config),
    onlineStatus: readString(raw.online_status),
    orderReleaseEnabled: readBoolean(raw.order_release_enabled),
    autoAcceptEnabled: readBoolean(raw.auto_accept_enabled),
    posMetadata: asJsonObject(raw.pos_metadata),
    orderManagerClientId: readString(raw.order_manager_client_id),
    isOrderManagerPending: readBoolean(raw.is_order_manager_pending),
  };
}

/** Store status accepts both the current delivery-suite snake_case and the legacy camelCase reason field. */
export function mapUberStoreStatusWire(
  value: unknown,
  requestedStoreId: string,
): UberStoreStatus {
  const raw = asObject(value);
  const storeId = readString(requestedStoreId);
  const status = readString(raw?.status);
  if (!raw || !storeId || !status)
    throw mappingFailure(
      'merchant.retrieve-store-status',
      'UBER_STORE_STATUS_MAPPING_FAILED',
      'Uber store status 响应缺少 status',
    );
  return {
    storeId,
    status,
    offlineReason: readString(raw.offlineReason, raw.offline_reason),
    offlineReasonMetadata: readString(
      raw.offlineReasonMetadata,
      raw.offline_reason_metadata,
    ),
    isOfflineUntil: readString(raw.isOfflineUntil, raw.is_offline_until),
  };
}

/** Prep-time wire data is normalized to seconds and never exposed as raw Uber payload. */
export function mapUberStorePrepTimeWire(
  value: unknown,
  requestedStoreId: string,
): UberStorePrepTime {
  const raw = asObject(value);
  const prepTimes = asObject(raw?.prep_times);
  const storeId = readString(requestedStoreId);
  const defaultPrepTimeSeconds = readFiniteNumber(
    prepTimes?.default_value ?? raw?.default_prep_time,
  );
  if (
    !raw ||
    !storeId ||
    defaultPrepTimeSeconds === null ||
    !Number.isInteger(defaultPrepTimeSeconds)
  )
    throw mappingFailure(
      'merchant.update-store-prep-time',
      'UBER_STORE_PREP_TIME_MAPPING_FAILED',
      'Uber prep time 响应缺少整数 default_value',
    );
  return { storeId, defaultPrepTimeSeconds };
}
