import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppLogger } from '../../../../common/app-logger';
import { getLogContext } from '../../../../common/log-context';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface UberTelemetryContext {
  correlationId?: string | null;
  eventId?: string | null;
  externalOrderId?: string | null;
  orderStableId?: string | null;
  uberStoreId?: string | null;
  posStoreId?: string | null;
  menuPublishVersionStableId?: string | null;
  orderActionId?: string | null;
  opsTicketStableId?: string | null;
  uberRequestId?: string | null;
}

export type UberMetricName =
  | 'ubereats_webhook_received_total'
  | 'ubereats_webhook_processed_total'
  | 'ubereats_webhook_failed_total'
  | 'ubereats_webhook_duplicate_total'
  | 'ubereats_webhook_latency_ms'
  | 'ubereats_inbox_backlog'
  | 'ubereats_inbox_oldest_age_seconds'
  | 'ubereats_outbox_backlog'
  | 'ubereats_outbox_oldest_age_seconds'
  | 'ubereats_api_latency_ms'
  | 'ubereats_api_429_total'
  | 'ubereats_rate_limit_rejected_total'
  | 'ubereats_rate_limit_queue_depth'
  | 'ubereats_rate_limit_wait_ms'
  | 'ubereats_api_5xx_total'
  | 'ubereats_api_timeout_total'
  | 'ubereats_oauth_refresh_failed_total'
  | 'ubereats_menu_publish_duration_ms'
  | 'ubereats_menu_confirmation_timeout_total'
  | 'ubereats_menu_publish_failed_total'
  | 'ubereats_order_amount_difference_cents'
  | 'ubereats_order_auto_rejected_total';

type MetricLabels = Readonly<Record<string, string>>;
type LogLevel = 'debug' | 'log' | 'warn' | 'error';

const CONTEXT_KEYS = new Set<keyof UberTelemetryContext>([
  'correlationId',
  'eventId',
  'externalOrderId',
  'orderStableId',
  'uberStoreId',
  'posStoreId',
  'menuPublishVersionStableId',
  'orderActionId',
  'opsTicketStableId',
  'uberRequestId',
]);
const ATTRIBUTE_ALLOWLIST = new Set([
  'operation',
  'outcome',
  'reason',
  'status',
  'eventType',
  'attempt',
  'durationMs',
  'latencyMs',
  'backlog',
  'oldestAgeSeconds',
  'httpStatus',
  'errorCode',
  'retryable',
  'amountDifferenceCents',
  'failureCategory',
  'rootType',
  'topLevelKeys',
  'orderIdFields',
  'totalFields',
  'itemsShape',
  'cartShape',
  'cartItemsShape',
  'paymentShape',
  'chargesShape',
]);
const LABEL_ALLOWLIST = new Set([
  'operation',
  'outcome',
  'eventType',
  'failureCategory',
  'queue',
  'reason',
]);
const SECRET_KEY =
  /(token|authorization|signature|secret|password|cookie|rawBody|payload|phone|address)/i;
const ORDER_DETAIL_INVALID_MESSAGE =
  /^\[ubereats order\] detail invalid category=(mapping|business) reason=(MALFORMED_PAYLOAD|MISSING_ORDER_ID|MISSING_TOTAL|EMPTY_ITEMS)$/;

/** Uber Eats observability boundary: correlated events, safe logs and low-cardinality metrics. */
@Injectable()
export class UberTelemetryService {
  private readonly logger = new AppLogger(UberTelemetryService.name);
  private readonly metrics = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async captureEvent(
    eventName: string,
    attributes: Record<string, unknown> = {},
    context: UberTelemetryContext = {},
  ): Promise<void> {
    const correlated = this.contextFrom(attributes, context);
    const safeAttributes = this.sanitize(attributes, ATTRIBUTE_ALLOWLIST);
    const data = {
      eventName,
      source: 'ubereats',
      payload: { ...safeAttributes, ...correlated } as Prisma.JsonObject,
    };
    const idempotencyKey = correlated.eventId;
    if (idempotencyKey) {
      await this.prisma.opsEvent.upsert({
        where: { idempotencyKey },
        create: { ...data, idempotencyKey },
        // A retried command must not mutate or redeliver the original event.
        update: {},
      });
    } else {
      await this.prisma.opsEvent.create({ data });
    }
    this.log('log', eventName, correlated, safeAttributes);
  }

  log(
    level: LogLevel,
    eventName: string,
    context: UberTelemetryContext = {},
    attributes: Record<string, unknown> = {},
  ): void {
    const entry = {
      event: eventName,
      ...this.contextFrom({}, context),
      ...this.sanitize(attributes, ATTRIBUTE_ALLOWLIST),
    };
    this.logger[level](JSON.stringify(entry));
  }

  /** Compatibility sink for workflow diagnostics: only structured allowlisted fields are emitted. */
  workflowLog(
    level: LogLevel,
    message?: unknown,
    details: Record<string, unknown> = {},
  ): void {
    this.log(level, 'ubereats_workflow_diagnostic', {}, {
      ...this.workflowMessageAttributes(message),
      ...details,
    });
  }

  increment(name: UberMetricName, labels: MetricLabels = {}, value = 1): void {
    this.updateMetric(name, labels, value, false);
  }

  observe(
    name: UberMetricName,
    value: number,
    labels: MetricLabels = {},
  ): void {
    if (!Number.isFinite(value)) return;
    this.updateMetric(`${name}_count`, labels, 1, false);
    this.updateMetric(`${name}_sum`, labels, value, false);
  }

  gauge(name: UberMetricName, value: number, labels: MetricLabels = {}): void {
    if (Number.isFinite(value)) this.updateMetric(name, labels, value, true);
  }

  /** Dependency-neutral snapshot for a Prometheus/OpenTelemetry adapter. */
  metricSnapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.metrics);
  }

  private workflowMessageAttributes(
    message: unknown,
  ): Record<string, unknown> {
    if (typeof message !== 'string') return {};
    const match = ORDER_DETAIL_INVALID_MESSAGE.exec(message);
    if (!match) return {};
    return {
      operation: 'order.detail.parse',
      failureCategory: match[1],
      reason: match[2],
    };
  }

  private contextFrom(
    attributes: Record<string, unknown>,
    supplied: UberTelemetryContext,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const correlationId = supplied.correlationId ?? getLogContext()?.requestId;
    const merged = { ...attributes, ...supplied, correlationId };
    for (const key of CONTEXT_KEYS) {
      const value = merged[key];
      if (typeof value === 'string' && value.trim())
        result[key] = value.trim().slice(0, 200);
    }
    return result;
  }

  private sanitize(
    input: Record<string, unknown>,
    allowlist: ReadonlySet<string>,
  ): Prisma.JsonObject {
    const output: Prisma.JsonObject = {};
    for (const [key, value] of Object.entries(input)) {
      if (
        !allowlist.has(key) ||
        CONTEXT_KEYS.has(key as keyof UberTelemetryContext) ||
        SECRET_KEY.test(key)
      )
        continue;
      if (typeof value === 'string') output[key] = value.slice(0, 200);
      else if (typeof value === 'number' && Number.isFinite(value))
        output[key] = value;
      else if (typeof value === 'boolean' || value === null)
        output[key] = value;
    }
    return output;
  }

  private updateMetric(
    name: string,
    labels: MetricLabels,
    value: number,
    replace: boolean,
  ): void {
    const safeLabels = Object.entries(labels)
      .filter(([key]) => LABEL_ALLOWLIST.has(key))
      .map(([key, item]) => [key, item.slice(0, 64)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    const key = `${name}${safeLabels.length ? `{${safeLabels.map(([k, v]) => `${k}=${v}`).join(',')}}` : ''}`;
    this.metrics.set(
      key,
      replace ? value : (this.metrics.get(key) ?? 0) + value,
    );
  }
}
