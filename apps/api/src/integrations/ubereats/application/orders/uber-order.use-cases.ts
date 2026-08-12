import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import type { UberOrderCancelEventV1 } from '../../contracts/events/uber-order-cancel.v1';
import type { UberEventOrdering } from '../ports/uber-order-processing.ports';
import { UberOrderActionService } from './uber-order-action.service';
import {
  type UberOrderEventCursor,
  type UberOrderImportRepositoryPort,
} from '../ports/uber-order.ports';
import { type UberOrderDetailGatewayPort } from '../ports/uber-api.ports';
import {
  UberOrderPayloadParser,
  validateUberOrderAmounts,
} from '../../domain/orders/uber-order-payload.parser';
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';

/** Imports an event once, keyed by the Uber event id; the adapter owns its graph transaction. */
export class ImportUberOrderUseCase {
  private readonly parser = new UberOrderPayloadParser();

  constructor(
    private readonly repository: UberOrderImportRepositoryPort,
    private readonly detailGateway: UberOrderDetailGatewayPort,
    private readonly actions: UberOrderActionService,
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

    const raw = await this.detailGateway.fetchOrderDetail({
      resourceHref: payload.resourceHref,
      eventType: normalizedEventType,
      eventId,
      resourceId: externalOrderId ?? null,
    });
    const order = this.parser.parse(raw);
    if (!order) {
      if (externalOrderId)
        await this.actions.request(externalOrderId, 'DENY', {
          reasonCode: 'INVALID_ORDER',
          reasonDetail: '订单详情无法解析',
        });
      return;
    }
    const externalIds = order.items
      .map((item) => item.externalItemId)
      .filter((id): id is string => !!id);
    const mappings = await this.repository.findMenuMappings(
      order.storeId ?? '',
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
    if (mismatch || validateUberOrderAmounts(order).hasMaterialVariance) {
      await this.actions.request(order.externalOrderId, 'DENY', {
        reasonCode: 'PRICE_MISMATCH',
        reasonDetail: '订单金额与已发布菜单不一致',
      });
      return;
    }
    const cancellation = this.cancellation(normalizedEventType, order);
    await this.repository.saveImportedOrder({
      order,
      eventType: normalizedEventType,
      cursor,
      menuMappings: mappings,
      cancellation,
      receivedAt: new Date(),
    });
    // Deliberately outside the import transaction. A failed enqueue leaves the
    // committed order replayable; the duplicate branch retries this intent.
    await this.requestDecision(
      order.externalOrderId,
      normalizedEventType,
      cancellation,
    );
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
  private cancellation(
    eventType: string,
    order: ReturnType<UberOrderPayloadParser['parse']>,
  ) {
    if (!order || !this.isCancellation(eventType)) return null;
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
        reasonCode,
        reasonDetail: reasonDetail ?? null,
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
  constructor(private readonly actions: UberOrderActionService) {}
  execute(limit = 50) {
    return this.actions.process(limit, `worker-${process.pid}`);
  }
}

// Compatibility re-exports keep callers on the application boundary while the
// focused implementations live in their own files.
export { SyncUberOrderStatusUseCase } from './sync-uber-order-status.use-case';
export { ListPendingUberOrdersQuery } from './list-pending-uber-orders.query';
