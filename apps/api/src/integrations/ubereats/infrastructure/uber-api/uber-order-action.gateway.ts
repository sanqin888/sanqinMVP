import { Inject, Injectable } from '@nestjs/common';
import type {
  UberOrderActionGatewayPort,
  UberOrderCommandFailure,
  UberOrderDenial,
} from '../../application/orders/uber-order.ports';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberApiError } from './uber-http.client';

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
  ) {
    super(message);
    this.name = 'UberOrderCommandError';
  }
}

/** Owns Uber endpoints, wire payloads and HTTP outcome semantics. */
@Injectable()
export class UberOrderActionGatewayAdapter implements UberOrderActionGatewayPort {
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<UberOrderGateway, 'executeAction'>,
  ) {}

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
  cancel(input: { externalOrderId: string; idempotencyKey: string }) {
    // CANCEL remains a business action everywhere else. This adapter alone
    // translates it to Uber's merchant-denial endpoint and wire payload.
    return this.execute(input, 'DENY', {
      reason: { code: 'OTHER', explanation: 'Cancelled by merchant' },
    });
  }
  readyForPickup(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'READY_FOR_PICKUP', {});
  }

  private async execute(
    input: { externalOrderId: string; idempotencyKey: string },
    action: 'ACCEPT' | 'DENY' | 'READY_FOR_PICKUP',
    payload: Record<string, unknown>,
  ): Promise<void> {
    let outcome: Awaited<ReturnType<UberOrderGateway['executeAction']>>;
    try {
      outcome = await this.gateway.executeAction(
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
    if (outcome.ok || (action === 'READY_FOR_PICKUP' && outcome.status === 409))
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
