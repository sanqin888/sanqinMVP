import { Inject, Injectable } from '@nestjs/common';
import type {
  UberOrderDetailQueryPort,
  UberOrderDetailResult,
} from '../../application/orders/uber-order-query.ports';
import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../../application/shared/uber-telemetry.port';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';
import { normalizeUberEventType } from '../../domain/webhook/uber-event-type';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../shared/uber-log.utils';
import { mapUberGatewayFailure } from './uber-error.mapper';
import { UberOrderGateway } from './uber-resource.gateways';
import { UBER_CLIENT_CREDENTIAL_SCOPES } from './uber-scopes';

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
    const resourcePath = await this.gateway.pathFromResourceHref(
      input.resourceHref,
    );
    const path =
      normalizeUberEventType(input.eventType) ===
      'orders.scheduled.notification'
        ? withScheduledOrderExpansions(resourcePath)
        : withRequiredOrderExpansions(resourcePath);
    const result = await this.gateway.inspect({
      path,
      method: 'GET',
      operation: 'uber.order.detail',
      scope: UBER_CLIENT_CREDENTIAL_SCOPES.ORDER,
      kind: 'orderDetail',
    });
    if (result.response.ok) {
      const mapped = this.parser.parseResult(result.data, {
        eventType: input.eventType,
      });
      if (mapped.kind === 'parsed') return mapped;

      const level = mapped.category === 'mapping' ? 'error' : 'warn';
      this.telemetry.workflowLog(
        level,
        `[ubereats order] detail invalid category=${mapped.category} reason=${mapped.reason}`,
      );
      this.telemetry.workflowLog(
        level,
        '[ubereats order] detail shape',
        summarizeOrderFulfillmentV1Shape(result.data, input.eventType),
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

/** Order Fulfillment API 1.0.0 requires carts/payment to map the SanQ order. */
export function withRequiredOrderExpansions(path: string): string {
  if (!path.startsWith('/v1/delivery/order/'))
    throw new Error('Uber order detail must use Order Fulfillment API 1.0.0');
  const separator = path.indexOf('?');
  const pathname = separator >= 0 ? path.slice(0, separator) : path;
  const search = separator >= 0 ? path.slice(separator + 1) : '';
  const params = new URLSearchParams(search);
  const expanded = new Set(
    (params.get('expand') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  expanded.add('carts');
  expanded.add('payment');
  params.set('expand', [...expanded].join(','));
  return `${pathname}?${params.toString()}`;
}

/** Scheduled Uber delivery timing can additionally use courier pickup ETA. */
export function withScheduledOrderExpansions(path: string): string {
  const requiredPath = withRequiredOrderExpansions(path);
  const separator = requiredPath.indexOf('?');
  const pathname = requiredPath.slice(0, separator);
  const params = new URLSearchParams(requiredPath.slice(separator + 1));
  const expanded = new Set(
    (params.get('expand') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  expanded.add('deliveries');
  params.set('expand', [...expanded].join(','));
  return `${pathname}?${params.toString()}`;
}

function summarizeOrderFulfillmentV1Shape(
  payload: unknown,
  eventType: string,
): Record<string, unknown> {
  const envelope = asRecord(payload);
  const order = asRecord(envelope?.order) ?? envelope;
  const payment = asRecord(order?.payment);
  const paymentDetail = asRecord(payment?.payment_detail);
  const itemCharges = asRecord(paymentDetail?.item_charges);

  return {
    operation: 'order.detail.shape',
    contract: 'order-fulfillment-1.0.0',
    eventType,
    rootType: valueShape(payload),
    topLevelKeys: safeTopLevelKeys(order),
    orderIdShape: valueShape(order?.id),
    cartsShape: valueShape(order?.carts),
    customersShape: valueShape(order?.customers),
    deliveriesShape: valueShape(order?.deliveries),
    paymentShape: valueShape(order?.payment),
    paymentDetailShape: valueShape(payment?.payment_detail),
    orderTotalShape: valueShape(paymentDetail?.order_total),
    itemChargesShape: valueShape(paymentDetail?.item_charges),
    priceBreakdownShape: valueShape(itemCharges?.price_breakdown),
    preparationTimeShape: valueShape(order?.preparation_time),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
