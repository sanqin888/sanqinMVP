import type {
  UberOrderCancelEventV1,
  UberOrderNotificationEventV1,
} from '../../domain/webhook/uber-webhook-event.parser';
import type { UberEventOrdering } from './uber-order-processing.ports';
import { UberOrderActionService } from './uber-order-action.service';
import {
  type UberOrderActionRepositoryPort,
  type UberOrderEventCursor,
  type UberOrderImportRepositoryPort,
} from './uber-order.ports';
import { type UberOrderDetailQueryPort } from './uber-order-query.ports';
import { validateUberOrderAmounts } from '../../domain/orders/uber-order-payload.parser';
import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';
import { normalizeUberEventType } from '../../domain/webhook/uber-event-type';
import type { UberStoreMappingRepositoryPort } from '../merchant/uber-merchant-persistence.ports';
import { UberApplicationError } from '../shared/uber-application.error';

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

/** Imports an event once, keyed by the Uber event id; the adapter owns its graph transaction. */
export class ImportUberOrderUseCase {
  constructor(
    private readonly repository: UberOrderImportRepositoryPort,
    private readonly detailGateway: UberOrderDetailQueryPort,
    private readonly actions: UberOrderActionService,
    private readonly storeMappings: UberStoreMappingRepositoryPort,
  ) {}
  async execute(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1 | UberOrderCancelEventV1,
    ordering?: UberEventOrdering,
  ) {
    const normalizedEventType = normalizeUberEventType(eventType);
    const externalOrderId = payload.resourceId;
    const cursor: UberOrderEventCursor = {
      eventId,
      occurredAt: ordering?.occurredAt ?? null,
      resourceVersion: ordering?.resourceVersion ?? null,
      sequence: ordering?.sequence ?? null,
    };
    const existing = externalOrderId
      ? await this.repository.findByExternalOrderId(externalOrderId)
      : null;
    if (existing?.cursor?.eventId === eventId) {
      await this.requestDecision(externalOrderId, normalizedEventType, null);
      return;
    }
    if (existing?.cursor && !this.isAfter(cursor, existing.cursor)) return;

    const detail = await this.detailGateway.fetchOrderDetail({
      resourceHref: payload.resourceHref,
      eventType: normalizedEventType,
      eventId,
      resourceId: externalOrderId ?? null,
    });
    if (detail.kind === 'invalid') {
      if (externalOrderId)
        await this.actions.request(externalOrderId, 'DENY', {
          reasonCode: 'INVALID_ORDER',
          reasonDetail:
            detail.reason === 'EMPTY_ITEMS'
              ? '订单不包含可导入商品'
              : '订单详情无法解析',
        });
      return;
    }
    const order = detail.order;
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
    const mappings = await this.repository.findMenuMappings(
      uberStoreId,
      externalIds,
    );
    const byId = new Map(mappings.map((item) => [item.externalItemId, item]));
    const missing = externalIds.find((id) => !byId.has(id));
    if (missing) {
      await this.actions.request(order.externalOrderId, 'DENY', {
        reasonCode: 'ITEM_UNAVAILABLE',
        reasonDetail: `缺失菜单映射: ${missing}`,
      });
      return;
    }
    const mismatch = order.items.find((item) => {
      const expected = byId.get(item.externalItemId ?? '')?.expectedPriceCents;
      return (
        expected !== undefined &&
        Math.abs(expected - item.baseUnitPriceCents) > 1
      );
    });
    const priceDenial =
      mismatch || validateUberOrderAmounts(order).hasMaterialVariance
        ? {
            reasonCode: 'PRICE_MISMATCH',
            reasonDetail: '订单金额与已发布菜单不一致',
          }
        : null;
    const connectivity = this.repository.getPosStoreConnectivity
      ? await this.repository.getPosStoreConnectivity(posStoreId)
      : { status: 'UNKNOWN' as const, lastHeartbeatAt: null };
    const connectivityDenial =
      connectivity.status === 'OFFLINE'
        ? {
            reasonCode: 'POS_OFFLINE',
            reasonDetail: connectivity.lastHeartbeatAt
              ? `POS connectivity offline; last heartbeat ${connectivity.lastHeartbeatAt.toISOString()}`
              : 'POS connectivity offline; no recent heartbeat',
          }
        : null;
    const denial = priceDenial ?? connectivityDenial;
    const cancellation = this.cancellation(normalizedEventType, order);
    const decision = cancellation
      ? null
      : this.actions.buildIntent({
          externalOrderId: order.externalOrderId,
          action: denial ? 'DENY' : 'ACCEPT',
          denial: denial ?? undefined,
        });
    await this.repository.saveImportedOrder({
      order,
      posStoreId,
      eventType: normalizedEventType,
      cursor,
      menuMappings: mappings,
      cancellation,
      actionIntent: decision,
      receivedAt: new Date(),
    });
  }

  processWebhookEvent(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1,
    ordering?: UberEventOrdering,
  ) {
    return this.execute(eventType, eventId, payload, ordering);
  }

  private async requestDecision(
    externalOrderId: string,
    eventType: string,
    cancellation: unknown,
  ): Promise<void> {
    if (cancellation || this.isCancellation(eventType)) return;
    await this.actions.request(externalOrderId, 'ACCEPT');
  }
  private cancellation(eventType: string, order: ParsedUberOrder) {
    if (!this.isCancellation(eventType)) return null;
    const value = order.cancellation ?? {
      cancelledBy: null,
      reasonCode: null,
      reasonDetail: null,
      occurredAt: new Date(),
    };
    return {
      kind: eventType.endsWith('rejected')
        ? ('REJECTED' as const)
        : ('CANCELLED' as const),
      ...value,
    };
  }
  private isCancellation(eventType: string): boolean {
    return ['orders.cancelled', 'orders.cancel', 'orders.rejected'].includes(
      eventType,
    );
  }
  private isAfter(
    next: UberOrderEventCursor,
    current: UberOrderEventCursor,
  ): boolean {
    if (next.sequence !== null && current.sequence !== null)
      return next.sequence > current.sequence;
    if (next.resourceVersion !== null && current.resourceVersion !== null) {
      const nextNumber = Number(next.resourceVersion);
      const currentNumber = Number(current.resourceVersion);
      return Number.isFinite(nextNumber) && Number.isFinite(currentNumber)
        ? nextNumber > currentNumber
        : next.resourceVersion > current.resourceVersion;
    }
    if (next.occurredAt && current.occurredAt)
      return next.occurredAt.getTime() > current.occurredAt.getTime();
    return true;
  }
}
/** Cancellation is an event-idempotent order import with its own transaction boundary. */
export class CancelUberOrderUseCase extends ImportUberOrderUseCase {}
/** Atomically creates an action intent; externalOrderId + action is the idempotency key. */
export class RequestUberOrderActionUseCase {
  constructor(private readonly actions: UberOrderActionService) {}
  async accept(id: string) {
    return this.present(await this.actions.request(id, 'ACCEPT'));
  }
  async deny(id: string, reasonCode: string, reasonDetail?: string) {
    return this.present(
      await this.actions.request(id, 'DENY', {
        reasonCode: reasonCode.trim(),
        reasonDetail: reasonDetail?.trim() || null,
      }),
    );
  }
  async cancel(id: string, reason?: string) {
    return this.present(
      await this.actions.request(id, 'CANCEL', {
        reasonCode: 'OTHER',
        reasonDetail: reason?.trim() || null,
      }),
    );
  }
  async retryReadyForPickup(id: string) {
    return this.present(await this.actions.request(id, 'READY_FOR_PICKUP'));
  }
  async getReadyForPickupAction(id: string) {
    return this.present(await this.actions.request(id, 'READY_FOR_PICKUP'));
  }
  private present(intent: { taskId: string; created: boolean }): {
    ok: boolean;
    id: string;
    actionId: string;
    status: string;
    retryable: boolean;
    duplicate: boolean;
    lastError: string | null;
  } {
    return {
      ok: false,
      id: intent.taskId,
      actionId: intent.taskId,
      status: 'PENDING',
      retryable: true,
      duplicate: !intent.created,
      lastError: null,
    };
  }
}
/** Claims durable action leases and records each gateway result in a separate transaction. */
export class ExecuteUberOrderActionWorker {
  private static readonly LEASE_DURATION_MS = 30_000;

  constructor(
    private readonly repository: UberOrderActionRepositoryPort,
    private readonly actions: UberOrderActionService,
  ) {}

  async execute(limit = 50): Promise<number> {
    const tasks = await this.repository.claim({
      limit,
      owner: `worker-${process.pid}`,
      now: new Date(),
      leaseDurationMs: ExecuteUberOrderActionWorker.LEASE_DURATION_MS,
    });
    await Promise.all(tasks.map((task) => this.actions.executeClaimed(task)));
    return tasks.length;
  }
}
