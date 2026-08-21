import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../common/app-logger';
import type {
  UberOrderActionGatewayPort,
  UberOrderCommandFailure,
  UberOrderDenial,
  UberOrderSafeErrorBody,
} from '../../application/orders/uber-order.ports';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberApiError } from './uber-http.client';

type UberWireOrderAction = UberOrderActionName;

type UberOrderFailureReasonType =
  | 'ITEM_ISSUE'
  | 'ORDER_VALIDATION'
  | 'STORE_CLOSED'
  | 'TECHNICAL_FAILURE'
  | 'POS_NOT_READY'
  | 'POS_OFFLINE'
  | 'CAPACITY'
  | 'ADDRESS'
  | 'SPECIAL_INSTRUCTIONS'
  | 'PRICING'
  | 'OTHER';

/** Uber treats repeated terminal transitions as conflicts/not-found in some states. */
const IDEMPOTENT_CONFLICT_STATUSES: Readonly<
  Record<UberWireOrderAction, readonly number[]>
> = {
  ACCEPT: [409],
  DENY: [409],
  READY_FOR_PICKUP: [409],
  CANCEL: [404, 409],
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
    readonly responseBody: UberOrderSafeErrorBody | null = null,
  ) {
    super(message);
    this.name = 'UberOrderCommandError';
  }
}

/** Owns Order Fulfillment 1.0.0 endpoints, wire payloads and HTTP semantics. */
@Injectable()
export class UberOrderActionGatewayAdapter implements UberOrderActionGatewayPort {
  private readonly logger = new AppLogger(UberOrderActionGatewayAdapter.name);

  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<UberOrderGateway, 'sendActionCommand'>,
  ) {}

  accept(input: {
    externalOrderId: string;
    idempotencyKey: string;
    readyForPickupAt?: Date;
  }) {
    return this.execute(
      input,
      'ACCEPT',
      input.readyForPickupAt
        ? { ready_for_pickup_time: input.readyForPickupAt.toISOString() }
        : {},
    );
  }

  deny(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial: UberOrderDenial;
  }) {
    return this.execute(input, 'DENY', {
      deny_reason: this.reason(input.denial),
    });
  }

  cancel(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial?: UberOrderDenial;
  }) {
    return this.execute(input, 'CANCEL', {
      cancellation_reason: this.reason(
        input.denial ?? {
          reasonCode: 'OTHER',
          reasonDetail: 'Cancelled by merchant',
        },
      ),
    });
  }

  readyForPickup(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'READY_FOR_PICKUP', {});
  }

  private async execute(
    input: { externalOrderId: string; idempotencyKey: string },
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

    const responseBody = this.safeErrorBody(outcome.data);
    this.logger.error(
      `[uber order action failed] action=${action} externalOrderId=${input.externalOrderId} status=${outcome.status} response=${JSON.stringify(responseBody).slice(0, 4_000)}`,
    );
    throw new UberOrderCommandError(
      outcome.status,
      undefined,
      `UBER_ORDER_HTTP_${outcome.status}`,
      this.retryAfterMs(outcome.retryAfter),
      responseBody,
    );
  }

  private safeErrorBody(value: unknown, depth = 0): UberOrderSafeErrorBody {
    if (depth >= 6) return '[TRUNCATED]';
    if (value === null) return null;
    if (typeof value === 'string') return this.safeString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value))
      return value
        .slice(0, 30)
        .map((item) => this.safeErrorBody(item, depth + 1));
    if (!this.isRecord(value)) return '[UNSUPPORTED]';

    const result: Record<string, UberOrderSafeErrorBody> = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      result[key] = /authorization|token|secret|password|email|phone|address/i.test(
        key,
      )
        ? '[REDACTED]'
        : this.safeErrorBody(item, depth + 1);
    }
    return result;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private safeString(value: string): string {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*[^\s,;"}]+/gi,
        'credential=[REDACTED]',
      )
      .replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        '[REDACTED_EMAIL]',
      )
      .slice(0, 1_000);
  }

  private retryAfterMs(value: string | null): number | null {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.round(seconds * 1_000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
  }

  private reason(denial: UberOrderDenial): {
    type: UberOrderFailureReasonType;
    info: string;
    client_error_code: string;
  } {
    const reasonCode = denial.reasonCode.trim().toUpperCase();
    const aliases: Record<string, UberOrderFailureReasonType> = {
      INVALID_ORDER: 'ORDER_VALIDATION',
      ITEM_UNAVAILABLE: 'ITEM_ISSUE',
      ITEM_AVAILABILITY: 'ITEM_ISSUE',
      MISSING_ITEM: 'ITEM_ISSUE',
      MISSING_INFO: 'ORDER_VALIDATION',
      PRICE_MISMATCH: 'PRICING',
    };
    const supported = new Set<UberOrderFailureReasonType>([
      'ITEM_ISSUE',
      'ORDER_VALIDATION',
      'STORE_CLOSED',
      'TECHNICAL_FAILURE',
      'POS_NOT_READY',
      'POS_OFFLINE',
      'CAPACITY',
      'ADDRESS',
      'SPECIAL_INSTRUCTIONS',
      'PRICING',
      'OTHER',
    ]);
    const mapped = aliases[reasonCode] ?? reasonCode;
    const type = supported.has(mapped) ? mapped : 'OTHER';
    return {
      type,
      info: denial.reasonDetail?.trim() || denial.reasonCode.trim(),
      client_error_code: reasonCode || 'OTHER',
    };
  }
}
