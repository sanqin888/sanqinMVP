<<<<<<< HEAD
import { Inject, Injectable } from '@nestjs/common';
import type {
  UberOrderActionGatewayPort,
  UberOrderCommandFailure,
  UberOrderDenial,
} from '../../application/orders/uber-order.ports';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberApiError } from './uber-http.client';

type UberWireOrderAction = 'ACCEPT' | 'DENY' | 'READY_FOR_PICKUP';

/**
 * Uber reports a repeated transition as HTTP 409 rather than replaying the
 * original success response. Keep that wire-level idempotency rule here: the
 * application still sees four business actions and never has to understand
 * that CANCEL shares DENY's Uber command.
 */
const IDEMPOTENT_CONFLICT_STATUSES: Readonly<
  Record<UberWireOrderAction, readonly number[]>
> = {
  ACCEPT: [409],
  DENY: [409],
  READY_FOR_PICKUP: [409],
};

export class UberOrderCommandError
  extends Error
  implements UberOrderCommandFailure
{
  constructor(
    readonly status: number | null,
    message = status === null
      ? 'Uber order command failed before receiving an HTTP response'
      : `Uber order command failed with HTTP ${status}`,
    readonly code?: string,
    readonly retryAfterMs: number | null = null,
=======
import { Injectable } from '@nestjs/common';
import type {
  UberOrderActionGatewayPort,
  UberOrderDenial,
} from '../../application/ports/uber-order.ports';
import { UberOrderGateway } from './uber-resource.gateways';

export class UberOrderCommandError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
    message = `Uber order command failed with HTTP ${status}`,
>>>>>>> origin/main
  ) {
    super(message);
    this.name = 'UberOrderCommandError';
  }
}

/** Owns Uber endpoints, wire payloads and HTTP outcome semantics. */
@Injectable()
export class UberOrderActionGatewayAdapter implements UberOrderActionGatewayPort {
<<<<<<< HEAD
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<UberOrderGateway, 'sendActionCommand'>,
  ) {}
=======
  constructor(private readonly gateway: UberOrderGateway) {}
>>>>>>> origin/main

  accept(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'ACCEPT', {});
  }
  deny(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial: UberOrderDenial;
  }) {
    return this.execute(input, 'DENY', {
      reason: {
        code: this.reasonCode(input.denial.reasonCode),
        explanation:
          input.denial.reasonDetail?.trim() || input.denial.reasonCode.trim(),
      },
    });
  }
<<<<<<< HEAD
  cancel(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial?: UberOrderDenial;
  }) {
    // CANCEL remains a business action everywhere else. This adapter alone
    // translates it to Uber's merchant-denial endpoint and wire payload.
    return this.execute(input, 'DENY', {
      reason: {
        code: this.reasonCode(input.denial?.reasonCode ?? 'OTHER'),
        explanation:
          input.denial?.reasonDetail?.trim() || 'Cancelled by merchant',
      },
=======
  cancel(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'DENY', {
      reason: { code: 'OTHER', explanation: 'Cancelled by merchant' },
>>>>>>> origin/main
    });
  }
  readyForPickup(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'READY_FOR_PICKUP', {});
  }

  private async execute(
    input: { externalOrderId: string; idempotencyKey: string },
<<<<<<< HEAD
    action: UberWireOrderAction,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let outcome: Awaited<ReturnType<UberOrderGateway['sendActionCommand']>>;
    try {
      outcome = await this.gateway.sendActionCommand(
        input.externalOrderId,
        action,
        payload,
        input.idempotencyKey,
      );
    } catch (error) {
      if (error instanceof UberApiError)
        throw new UberOrderCommandError(
          error.httpStatus,
          error.safeDetail,
          error.uberCode,
          error.retryAfterMs,
        );
      throw new UberOrderCommandError(null);
    }
    if (
      outcome.ok ||
      IDEMPOTENT_CONFLICT_STATUSES[action].includes(outcome.status)
    )
      return;
    throw new UberOrderCommandError(
      outcome.status,
      undefined,
      `UBER_ORDER_HTTP_${outcome.status}`,
      this.retryAfterMs(outcome.retryAfter),
    );
  }

  private retryAfterMs(value: string | null): number | null {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.round(seconds * 1_000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
  }

=======
    action: 'ACCEPT' | 'DENY' | 'READY_FOR_PICKUP',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const outcome = await this.gateway.executeAction(
      input.externalOrderId,
      action,
      payload,
      input.idempotencyKey,
    );
    if (outcome.ok || (action === 'READY_FOR_PICKUP' && outcome.status === 409))
      return;
    throw new UberOrderCommandError(
      outcome.status,
      outcome.status === 429 || outcome.status >= 500,
    );
  }

>>>>>>> origin/main
  private reasonCode(value: string): string {
    const code = value.trim().toUpperCase();
    if (code === 'ITEM_UNAVAILABLE') return 'ITEM_AVAILABILITY';
    return [
      'STORE_CLOSED',
      'POS_NOT_READY',
      'POS_OFFLINE',
      'ITEM_AVAILABILITY',
      'MISSING_ITEM',
      'MISSING_INFO',
      'PRICING',
      'CAPACITY',
      'ADDRESS',
      'SPECIAL_INSTRUCTIONS',
    ].includes(code)
      ? code
      : 'OTHER';
  }
}
