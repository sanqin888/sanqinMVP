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

    // Order Fulfillment 1.0.0 emits orders.failure as soon as the order fails;
    // Uber warns that an immediate detail read may itself fail. Once SanQ owns
    // the order, the signed webhook resource id is sufficient to persist the
    // cancellation without coupling local lifecycle to another detail request.
    if (normalizedEventType === 'orders.failure') {
      if (!externalOrderId)
        throw new UberApplicationError(
          'business-conflict',
          'UBER_ORDER_FAILURE_BEFORE_IMPORT',
          `Uber failure arrived before local order import: event=${eventId}; externalOrder=unknown`,
          'order.failure.persist',
          true,
        );
      if (!existing) {
        if (await this.repository.hasSucceededDenial?.(externalOrderId)) return;
        throw new UberApplicationError(
          'business-conflict',
          'UBER_ORDER_FAILURE_BEFORE_IMPORT',
          `Uber failure arrived before local order import: event=${eventId}; externalOrder=${externalOrderId}`,
          'order.failure.persist',
          true,
        );
      }
      await this.repository.saveExistingOrderCancellation({
        orderId: existing.orderId,
        externalOrderId,
        cursor,
        cancellation: {
          kind: 'CANCELLED',
          cancelledBy: null,
          reasonCode: 'UBER_ORDER_FAILURE',
          reasonDetail: null,
          occurredAt: cursor.occurredAt ?? new Date(),
        },
      });
      return;
    }

    // A scheduled order is first offered through orders.scheduled.notification,
    // then Uber can emit orders.notification again when the same order reaches
    // its executable/finalization phase. Preserve the scheduled interpretation
    // while refreshing the latest Uber detail, then reopen the durable ACCEPT
    // command with a phase-specific idempotency key. Treating this notification
    // as a brand-new immediate order would erase scheduled timing; ignoring it
    // leaves Uber in a provisional, non-finalized state and READY will fail.
    if (
      normalizedEventType === 'orders.notification' &&
      existing?.fulfillmentTiming === 'SCHEDULED' &&
      externalOrderId
    ) {
      const detail = await this.detailGateway.fetchOrderDetail({
        resourceHref: payload.resourceHref,
        eventType: 'orders.scheduled.notification',
        eventId,
        resourceId: externalOrderId,
      });
      if (detail.kind === 'invalid') {
        await this.persistStandaloneDecision(
          externalOrderId,
          this.admission.invalidDetail(detail.reason),
        );
        return;
      }

      const admission = await this.admission.evaluate(detail.order, eventId);
      if (!admission.canPersistOrder || admission.decision.kind === 'DENY') {
        await this.persistStandaloneDecision(
          externalOrderId,
          admission.decision,
        );
        return;
      }

      await this.repository.saveImportedOrder({
        order: detail.order,
        posStoreId: admission.posStoreId,
        eventType: normalizedEventType,
        cursor,
        menuMappings: admission.menuMappings,
        cancellation: null,
        actionIntent: null,
        receivedAt: new Date(),
      });
      await this.actions.requestScheduledFinalizeAccept(externalOrderId);
      return;
    }

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
    const admission = await this.admission.evaluate(order, eventId);
    if (!admission.canPersistOrder) {
      await this.persistStandaloneDecision(
        order.externalOrderId,
        admission.decision,
      );
      return;
    }

    await this.repository.saveImportedOrder({
      order,
      posStoreId: admission.posStoreId,
      eventType: normalizedEventType,
      cursor,
      menuMappings: admission.menuMappings,
      cancellation: null,
      actionIntent: this.buildAdmissionIntent(
        order.externalOrderId,
        admission.decision,
      ),
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
