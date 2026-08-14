<<<<<<< HEAD
import { Inject, Injectable } from '@nestjs/common';
import type { UberOrderDetailQueryPort } from '../../application/orders/uber-order-query.ports';
import type { UberTelemetryPort } from '../../application/shared/uber-telemetry.port';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../shared/uber-log.utils';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';
import { mapUberGatewayFailure } from './uber-error.mapper';
import type { UberOrderDetailResult } from '../../application/orders/uber-order-query.ports';

@Injectable()
export class UberOrderDetailGatewayAdapter implements UberOrderDetailQueryPort {
  private readonly parser = new UberOrderPayloadParser();
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<
      UberOrderGateway,
      'pathFromResourceHref' | 'inspect'
    >,
    private readonly telemetry: Pick<UberTelemetryPort, 'workflowLog'>,
=======
import { Injectable } from '@nestjs/common';
import {
  UberNonRetryableUpstreamError,
  UberTransientUpstreamError,
} from '../../application/errors/uber-application.error';
import type { UberOrderDetailGatewayPort } from '../../application/ports/uber-api.ports';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../../domain/shared/uber-integration.utils';
import { UberTelemetryService } from '../observability/uber-telemetry.service';
import { UberOrderGateway } from './uber-resource.gateways';

@Injectable()
export class UberOrderDetailGatewayAdapter implements UberOrderDetailGatewayPort {
  constructor(
    private readonly gateway: UberOrderGateway,
    private readonly telemetry: UberTelemetryService,
>>>>>>> origin/main
  ) {}

  async fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
<<<<<<< HEAD
  }): Promise<UberOrderDetailResult> {
=======
  }): Promise<unknown> {
>>>>>>> origin/main
    const path = await this.gateway.pathFromResourceHref(input.resourceHref);
    const result = await this.gateway.inspect({
      path,
      method: 'GET',
      operation: 'uber.order.detail',
      scope: 'eats.store.orders.read',
      kind: 'orderDetail',
    });
<<<<<<< HEAD
    if (result.response.ok) {
      const mapped = this.parser.parseResult(result.data);
      if (mapped.kind === 'parsed') return mapped;

      // Never include the response body here: it may contain credentials or PII.
      this.telemetry.workflowLog(
        mapped.category === 'mapping' ? 'error' : 'warn',
        `[ubereats order] detail invalid category=${mapped.category} reason=${mapped.reason}`,
      );
      return { kind: 'invalid', reason: mapped.reason };
    }
=======
    if (result.response.ok) return result.data;
>>>>>>> origin/main

    const detail = summarizeUberDebugResponse(result.data, result.text);
    this.telemetry.workflowLog(
      'error',
      `[ubereats order] detail fetch failed status=${result.response.status} eventType=${input.eventType} eventId=${input.eventId} resourceId=${input.resourceId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );
<<<<<<< HEAD
    throw mapUberGatewayFailure({
      kind: 'http',
      operation: 'order.fetch-detail',
      status: result.response.status,
      upstreamCode: null,
=======
    const ErrorType = [400, 401, 403, 404].includes(result.response.status)
      ? UberNonRetryableUpstreamError
      : UberTransientUpstreamError;
    throw new ErrorType({
      code: `UBER_ORDER_DETAIL_HTTP_${result.response.status}`,
      message: 'Uber 订单详情不可用',
      operation: 'order.fetch-detail',
>>>>>>> origin/main
    });
  }
}
