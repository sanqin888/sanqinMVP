import { validateUberOrderAmounts } from '../../domain/orders/uber-order-payload.parser';
import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';
import {
  UberOrderAdmissionPolicy,
  type UberOrderAdmissionDecision,
} from '../../domain/orders/uber-order-admission.policy';
import type { UberStoreMappingRepositoryPort } from '../merchant/uber-merchant-persistence.ports';
import { UberApplicationError } from '../shared/uber-application.error';
import type { UberStoreConfigQueryPort } from '../shared/uber-store-config.port';
import type {
  UberOrderImportRepositoryPort,
  UberOrderMenuMapping,
} from './uber-order.ports';

const POS_EXTERNAL_STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** A recoverable configuration failure: operators can repair the mapping and replay the inbox. */
export class UberOrderStoreMappingError extends UberApplicationError {
  constructor(
    code: string,
    readonly uberStoreId: string,
    readonly eventId: string,
    readonly externalOrderId: string,
  ) {
    super(
      'business-conflict',
      code,
      `${code}: event=${eventId}; uberStore=${uberStoreId}; externalOrder=${externalOrderId}`,
      'order.store-mapping.validate',
      true,
    );
  }
}

export type UberOrderImportContext = {
  storeStableId: string;
  menuMappings: UberOrderMenuMapping[];
  missingItemReference: string | null;
};

export type UberOrderAdmissionResult = UberOrderImportContext & {
  canPersistOrder: boolean;
  decision: UberOrderAdmissionDecision;
};

/** Collects application facts, then delegates the final business decision to the domain policy. */
export class UberOrderAdmissionService {
  private readonly policy = new UberOrderAdmissionPolicy();

  constructor(
    private readonly repository: UberOrderImportRepositoryPort,
    private readonly storeMappings: UberStoreMappingRepositoryPort,
    private readonly storeConfig: UberStoreConfigQueryPort,
  ) {}

  invalidDetail(
    reason: Parameters<UberOrderAdmissionPolicy['invalidDetail']>[0],
  ): UberOrderAdmissionDecision {
    return this.policy.invalidDetail(reason);
  }

  private async resolveStoreContext(order: ParsedUberOrder, eventId: string) {
    const uberStoreId = order.uberStoreId?.trim();
    if (!uberStoreId)
      throw new UberOrderStoreMappingError(
        'UBER_STORE_ID_MISSING',
        'unknown',
        eventId,
        order.externalOrderId,
      );
    const storeMapping = await this.storeMappings.findMapping(uberStoreId);
    if (!storeMapping)
      throw new UberOrderStoreMappingError(
        'UBER_STORE_MAPPING_NOT_FOUND',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );
    if (!storeMapping.isProvisioned)
      throw new UberOrderStoreMappingError(
        'UBER_STORE_MAPPING_NOT_PROVISIONED',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );
    const storeStableId = storeMapping.posExternalStoreId?.trim();
    if (!storeStableId)
      throw new UberOrderStoreMappingError(
        'UBER_POS_STORE_ID_MISSING',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );
    if (!POS_EXTERNAL_STORE_ID_PATTERN.test(storeStableId))
      throw new UberOrderStoreMappingError(
        'UBER_POS_STORE_ID_INVALID',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );
    return { uberStoreId, storeStableId };
  }

  async resolveImportContext(
    order: ParsedUberOrder,
    store: { uberStoreId: string; storeStableId: string },
  ): Promise<UberOrderImportContext> {
    const externalIds = order.items
      .map((item) => item.externalItemId)
      .filter((id): id is string => !!id);
    const menuMappings = await this.repository.findMenuMappings(
      store.uberStoreId,
      externalIds,
    );
    const byId = new Map(
      menuMappings.map((item) => [item.externalItemId, item]),
    );
    const itemWithoutExternalId = order.items.find(
      (item) => !item.externalItemId,
    );
    const missingItemReference = itemWithoutExternalId
      ? 'MISSING_EXTERNAL_ITEM_ID'
      : (externalIds.find((id) => !byId.has(id)) ?? null);

    return {
      storeStableId: store.storeStableId,
      menuMappings,
      missingItemReference,
    };
  }

  async evaluate(
    order: ParsedUberOrder,
    eventId: string,
  ): Promise<UberOrderAdmissionResult> {
    const store = await this.resolveStoreContext(order, eventId);
    const allergyPolicy = await this.storeConfig.getStoreAllergyPolicy(
      store.storeStableId,
    );
    const allergyRequest = order.allergyRequest ?? {
      hasRequest: false,
      allergens: [],
    };
    const allergyDecision = this.policy.evaluateAllergyRequest({
      hasRequest: allergyRequest.hasRequest,
      allergens: allergyRequest.allergens,
      policy: allergyPolicy,
    });
    if (allergyDecision.kind === 'DENY') {
      return {
        storeStableId: store.storeStableId,
        menuMappings: [],
        missingItemReference: null,
        canPersistOrder: false,
        decision: allergyDecision,
      };
    }

    const context = await this.resolveImportContext(order, store);
    const byId = new Map(
      context.menuMappings.map((item) => [item.externalItemId, item]),
    );
    const hasPriceMismatch =
      context.missingItemReference === null &&
      order.items.some((item) => {
        const expected = byId.get(
          item.externalItemId ?? '',
        )?.expectedPriceCents;
        return (
          expected !== undefined &&
          Math.abs(expected - item.baseUnitPriceCents) > 1
        );
      });
    const connectivity =
      context.missingItemReference === null &&
      this.repository.getPosStoreConnectivity
        ? await this.repository.getPosStoreConnectivity(context.storeStableId)
        : { status: 'UNKNOWN' as const, lastHeartbeatAt: null };
    const decision = this.policy.evaluate({
      missingItemReference: context.missingItemReference,
      hasPriceMismatch,
      hasMaterialAmountVariance:
        context.missingItemReference === null &&
        validateUberOrderAmounts(order).hasMaterialVariance,
      connectivity,
    });

    return {
      ...context,
      canPersistOrder: context.missingItemReference === null,
      decision,
    };
  }
}
