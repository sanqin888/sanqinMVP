import { Inject, Injectable } from '@nestjs/common';
import type { UberOrderDetailQueryPort } from '../../application/orders/uber-order-query.ports';
import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../../application/shared/uber-telemetry.port';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../shared/uber-log.utils';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';
import { mapUberGatewayFailure } from './uber-error.mapper';
import type { UberOrderDetailResult } from '../../application/orders/uber-order-query.ports';

const SENSITIVE_DIAGNOSTIC_KEY =
  /(token|authorization|signature|secret|password|cookie|rawbody|payload|phone|address)/i;

@Injectable()
export class UberOrderDetailGatewayAdapter implements UberOrderDetailQueryPort {
  private readonly parser = new UberOrderPayloadParser();
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<
      UberOrderGateway,
      'pathFromResourceHref' | 'inspect'
    >,
    @Inject(UBER_TELEMETRY_PORT)
    private readonly telemetry: Pick<UberTelemetryPort, 'workflowLog'>,
  ) {}

  async fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
  }): Promise<UberOrderDetailResult> {
    const path = await this.gateway.pathFromResourceHref(input.resourceHref);
    const result = await this.gateway.inspect({
      path,
      method: 'GET',
      operation: 'uber.order.detail',
      scope: 'eats.store.orders.read',
      kind: 'orderDetail',
    });
    if (result.response.ok) {
      const mapped = this.parser.parseResult(result.data);
      if (mapped.kind === 'parsed') return mapped;

      // Never include response values here: they may contain credentials or PII.
      const level = mapped.category === 'mapping' ? 'error' : 'warn';
      this.telemetry.workflowLog(
        level,
        `[ubereats order] detail invalid category=${mapped.category} reason=${mapped.reason}`,
      );
      this.telemetry.workflowLog(
        level,
        '[ubereats order] detail shape',
        summarizeOrderDetailShape(result.data, input.eventType),
      );
      return { kind: 'invalid', reason: mapped.reason };
    }

    const detail = summarizeUberDebugResponse(result.data, result.text);
    this.telemetry.workflowLog(
      'error',
      `[ubereats order] detail fetch failed status=${result.response.status} eventType=${input.eventType} eventId=${input.eventId} resourceId=${input.resourceId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );
    throw mapUberGatewayFailure({
      kind: 'http',
      operation: 'order.fetch-detail',
      status: result.response.status,
      upstreamCode: null,
    });
  }
}

function summarizeOrderDetailShape(
  payload: unknown,
  eventType: string,
): Record<string, unknown> {
  const root = asRecord(payload);
  const cart = asRecord(root?.cart);
  const payment = asRecord(root?.payment);
  const charges = asRecord(payment?.charges);
  const totalFields = [
    ...presentKeys(root, ['total', 'total_cents']),
    ...presentKeys(charges, ['total', 'total_promo_applied']).map(
      (key) => `payment.charges.${key}`,
    ),
  ];

  return {
    operation: 'order.detail.shape',
    eventType,
    rootType: valueShape(payload),
    topLevelKeys: safeTopLevelKeys(root),
    orderIdFields:
      presentKeys(root, ['order_id', 'id', 'external_order_id']).join(',') ||
      'none',
    totalFields: totalFields.join(',') || 'none',
    itemsShape: valueShape(root?.items),
    cartShape: valueShape(root?.cart),
    cartItemsShape: valueShape(cart?.items),
    paymentShape: valueShape(root?.payment),
    chargesShape: valueShape(payment?.charges),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function presentKeys(
  value: Record<string, unknown> | null,
  keys: readonly string[],
): string[] {
  if (!value) return [];
  return keys.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function safeTopLevelKeys(value: Record<string, unknown> | null): string {
  if (!value) return 'none';
  const keys = Object.keys(value)
    .filter((key) => !SENSITIVE_DIAGNOSTIC_KEY.test(key))
    .sort()
    .slice(0, 32);
  return keys.join(',') || 'none';
}

function valueShape(value: unknown): string {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return 'object';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return typeof value;
  return 'other';
}
