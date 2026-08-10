import { Inject, Injectable } from '@nestjs/common';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService, type UberOrderConfig } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import type {
  UberDenyReasonCode,
  UberOrderActionName,
} from './uber-order.types';
import { UberOrderGateway } from '../../infrastructure/uber-api/uber-api.gateway';

/** Owns Uber order action protocol details; persistence/idempotency stays in the outbox service. */
@Injectable()
export class UberOrderActionService {
  private readonly gateway: UberOrderGateway;
  constructor(
    private readonly auth: UberAuthService,
    private readonly http: UberHttpClient,
    @Inject(UberConfigService) private readonly config: UberOrderConfig,
    gateway?: UberOrderGateway,
  ) {
    this.gateway =
      gateway ?? new UberOrderGateway(http, auth, config as UberConfigService);
  }

  buildDenyPayload(reasonCode: string, reasonDetail?: string) {
    const normalized = reasonCode.trim();
    const code = this.toDenyReasonCode(normalized);
    return {
      reason: { code, explanation: reasonDetail?.trim() || normalized || code },
    };
  }

  buildPath(externalOrderId: string, action: UberOrderActionName): string {
    const id = encodeURIComponent(externalOrderId);
    return {
      ACCEPT: `/v1/eats/orders/${id}/accept_pos_order`,
      DENY: `/v1/eats/orders/${id}/deny_pos_order`,
      READY_FOR_PICKUP: `/v1/delivery/order/${id}/ready`,
    }[action];
  }

  async request(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
  ) {
    return this.gateway.request(this.buildPath(externalOrderId, action), {
      returnErrorResponse: true,
      method: 'POST',
      scope: 'eats.order',
      body: payload,
      kind: 'api',
      operation: `order.${action.toLowerCase()}`,
      idempotencyKey: `${externalOrderId}:${action}`,
    });
  }

  classify(action: UberOrderActionName, response: Response) {
    return {
      succeeded:
        response.ok ||
        (action === 'READY_FOR_PICKUP' && response.status === 409),
      retryable: response.status === 429 || response.status >= 500,
    };
  }

  isNonRetryableStatus(status: number) {
    return [400, 401, 403, 404].includes(status);
  }

  private toDenyReasonCode(reasonCode: string): UberDenyReasonCode {
    const code = reasonCode.trim().toUpperCase();
    if (
      [
        'STORE_CLOSED',
        'POS_NOT_READY',
        'POS_OFFLINE',
        'MISSING_ITEM',
        'MISSING_INFO',
        'PRICING',
        'CAPACITY',
        'ADDRESS',
        'SPECIAL_INSTRUCTIONS',
      ].includes(code)
    )
      return code as UberDenyReasonCode;
    if (code === 'ITEM_UNAVAILABLE' || code === 'ITEM_AVAILABILITY')
      return 'ITEM_AVAILABILITY';
    return 'OTHER';
  }
}
