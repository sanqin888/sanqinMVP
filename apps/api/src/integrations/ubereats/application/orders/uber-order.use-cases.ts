import type {
  UberOrderCancelEventV1,
  UberOrderNotificationEventV1,
} from '../../domain/webhook/uber-webhook-event.parser';
import type { UberEventOrdering } from './uber-order-processing.ports';
import { UberOrderActionService } from './uber-order-action.service';
import {
  type UberOrderActionRepositoryPort,
  type UberOrderEventCursor,
  type UberOrderImportActionIntent,
  type UberOrderImportRepositoryPort,
} from './uber-order.ports';
import { type UberOrderDetailQueryPort } from './uber-order-query.ports';
import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';
import type { UberOrderAdmissionDecision } from '../../domain/orders/uber-order-admission.policy';
import { normalizeUberEventType } from '../../domain/webhook/uber-event-type';
import type { UberStoreMappingRepositoryPort } from '../merchant/uber-merchant-persistence.ports';
import { UberApplicationError } from '../shared/uber-application.error';
import { UberOrderAdmissionService } from './uber-order-admission.service';

export { UberOrderStoreMappingError } from './uber-order-admission.service';

/** Imports an event once, keyed by the Uber event id; the adapter owns its graph transaction. */
export class ImportUberOrderUseCase {
  private readonly admission: UberOrderAdmissionService;

  constructor(
    private readonly repository: UberOrderImportRepositoryPort,
    private readonly detailGateway: UberOrderDetailQueryPort,
    private readonly actions: UberOrderActionService,
    storeMappings: UberStoreMappingRepositoryPort,
  ) {
    this.admission = new UberOrderAdmissionService(repository, storeMappings);
  }

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
    if (existing?.cursor?.eventId === eventId) return;
    if (existing?.cursor && !this.isAfter(cursor, existing.cursor)) return;

    const detail = await this.detailGateway.fetchOrderDetail({
      resourceHref: payload.resourceHref,
      eventType: normalizedEventType,
      eventId,
      resourceId: externalOrderId ?? null,
    });
    if (detail.kind === 'invalid') {
      const decision = this.admission.invalidDetail(detail.reason);
      if (externalOrderId)
        await this.persistStandaloneDecision(externalOrderId, decision);
      return;
    }

    const order = detail.order;
    const cancellation = this.cancellation(normalizedEventType, order);
    const admission = await this.admission.evaluate(order, eventId);

    if (cancellation && !admission.canPersistOrder) {
      throw new UberApplicationError(
        'business-conflict',
        'UBER_ORDER_MENU_MAPPING_INCOMPLETE',
        `Cancellation cannot be persisted until published menu mapping is available: event=${eventId}; externalOrder=${order.externalOrderId}`,
        'order.cancellation.persist',
        true,
      );
    }
    if (!cancellation && !admission.canPersistOrder) {
      await this.persistStandaloneDecision(
        order.externalOrderId,
        admission.decision,
      );
      return;
    }

    const actionIntent = cancellation
      ? null
      : this.buildAdmissionIntent(order.externalOrderId, admission.decision);
    await this.repository.saveImportedOrder({
      order,
      posStoreId: admission.posStoreId,
      eventType: normalizedEventType,
      cursor,
      menuMappings: admission.menuMappings,
      cancellation,
      actionIntent,
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

  private buildAdmissionIntent(
    externalOrderId: string,
    decision: UberOrderAdmissionDecision,
  ): UberOrderImportActionIntent {
    return decision.kind === 'DENY'
      ? this.actions.buildIntent({
          externalOrderId,
          action: 'DENY',
          denial: decision.denial,
        })
      : this.actions.buildIntent({ externalOrderId, action: 'ACCEPT' });
  }

  private async persistStandaloneDecision(
    externalOrderId: string,
    decision: UberOrderAdmissionDecision,
  ): Promise<void> {
    if (decision.kind !== 'DENY')
      throw new Error('Standalone Uber admission decision must be DENY');
    await this.actions.request(externalOrderId, 'DENY', decision.denial);
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
