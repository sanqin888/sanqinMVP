import { Inject, Injectable } from '@nestjs/common';
import type { UberOrderDetailQueryPort } from '../../application/orders/uber-order-query.ports';
import type { UberTelemetryPort } from '../../application/shared/uber-telemetry.port';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from '../shared/uber-log.utils';
import { UberOrderGateway } from './uber-resource.gateways';
import { UberOrderPayloadParser } from '../../domain/orders/uber-order-payload.parser';
import {
  mapUberGatewayError,
  UberGatewayMappingError,
} from './uber-error.mapper';
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
      const order = this.parser.parse(result.data);
      return order
        ? { kind: 'parsed', order }
        : { kind: 'invalid', reason: 'INVALID_ORDER_DETAIL' };
    }

    const detail = summarizeUberDebugResponse(result.data, result.text);
    this.telemetry.workflowLog(
      'error',
      `[ubereats order] detail fetch failed status=${result.response.status} eventType=${input.eventType} eventId=${input.eventId} resourceId=${input.resourceId ?? 'unknown'} detail=${redactUberLogText(detail)}`,
    );
    throw mapUberGatewayError(
      new UberGatewayMappingError(
        `UBER_ORDER_DETAIL_HTTP_${result.response.status}`,
        'order.fetch-detail',
        ![400, 401, 403, 404].includes(result.response.status),
      ),
    );
  }
}
