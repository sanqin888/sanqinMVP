import { validateUberOrderAmounts } from '../../domain/orders/uber-order-payload.parser';
import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';
import {
  UberOrderAdmissionPolicy,
  type UberOrderAdmissionDecision,
} from '../../domain/orders/uber-order-admission.policy';
import type { UberStoreMappingRepositoryPort } from '../merchant/uber-merchant-persistence.ports';
import { UberApplicationError } from '../shared/uber-application.error';
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
  posStoreId: string;
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
  ) {}

  invalidDetail(
    reason: Parameters<UberOrderAdmissionPolicy['invalidDetail']>[0],
  ): UberOrderAdmissionDecision {
    return this.policy.invalidDetail(reason);
  }

  async resolveImportContext(
    order: ParsedUberOrder,
    eventId: string,
  ): Promise<UberOrderImportContext> {
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
    const posStoreId = storeMapping.posExternalStoreId?.trim();
    if (!posStoreId)
      throw new UberOrderStoreMappingError(
        'UBER_POS_STORE_ID_MISSING',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );
    if (!POS_EXTERNAL_STORE_ID_PATTERN.test(posStoreId))
      throw new UberOrderStoreMappingError(
        'UBER_POS_STORE_ID_INVALID',
        uberStoreId,
        eventId,
        order.externalOrderId,
      );

    const externalIds = order.items
      .map((item) => item.externalItemId)
      .filter((id): id is string => !!id);
    const menuMappings = await this.repository.findMenuMappings(
      uberStoreId,
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

    return { posStoreId, menuMappings, missingItemReference };
  }

  async evaluate(
    order: ParsedUberOrder,
    eventId: string,
  ): Promise<UberOrderAdmissionResult> {
    const context = await this.resolveImportContext(order, eventId);
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
        ? await this.repository.getPosStoreConnectivity(context.posStoreId)
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
