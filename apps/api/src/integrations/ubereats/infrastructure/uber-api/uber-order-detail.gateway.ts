import { Inject, Injectable } from '@nestjs/common';
import {
  UberNonRetryableUpstreamError,
  UberTransientUpstreamError,
} from '../../application/shared/uber-application.error';
import type { UberOrderDetailQueryPort } from '../../application/orders/uber-order-query.ports';
import type { UberTelemetryPort } from '../../application/shared/uber-telemetry.port';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../shared/uber-log.utils';
import { UberOrderGateway } from './uber-resource.gateways';

@Injectable()
export class UberOrderDetailGatewayAdapter implements UberOrderDetailQueryPort {
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<
      UberOrderGateway,
      'pathFromResourceHref' | 'inspect'
    >,
    private readonly telemetry: Pick<UberTelemetryPort, 'workflowLog'>,
  ) {}

  async fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
  }): Promise<unknown> {
    const path = await this.gateway.pathFromResourceHref(input.resourceHref);
    const result = await this.gateway.inspect({
      path,
      method: 'GET',
      operation: 'uber.order.detail',
      scope: 'eats.store.orders.read',
      kind: 'orderDetail',
    });
    if (result.response.ok) return result.data;

    const detail = summarizeUberDebugResponse(result.data, result.text);
    this.telemetry.workflowLog(
      'error',
      `[ubereats order] detail fetch failed status=${result.response.status} eventType=${input.eventType} eventId=${input.eventId} resourceId=${input.resourceId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );
    const ErrorType = [400, 401, 403, 404].includes(result.response.status)
      ? UberNonRetryableUpstreamError
      : UberTransientUpstreamError;
    throw new ErrorType({
      code: `UBER_ORDER_DETAIL_HTTP_${result.response.status}`,
      message: 'Uber 订单详情不可用',
      operation: 'order.fetch-detail',
    });
  }
}
