import { Inject, Injectable } from '@nestjs/common';
import { UberAuthService } from '../merchant/uber-auth.service';
import {
  UberConfigService,
  type UberOrderConfig,
} from '../../infrastructure/config/uber-config.service';
import { UberHttpClient } from '../../infrastructure/http/uber-http.client';
import type {
  UberDenyReasonCode,
  UberOrderActionName,
} from '../../domain/orders/uber-order.types';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';

/** Owns Uber order action protocol details; persistence/idempotency stays in the outbox service. */
@Injectable()
export class UberOrderActionService {
  constructor(
    private readonly auth: UberAuthService,
    private readonly http: UberHttpClient,
    @Inject(UberConfigService) private readonly config: UberOrderConfig,
  ) {}

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
    const token = await this.auth.getAccessToken('eats.order');
    return this.http.request({
      returnErrorResponse: true,
      path: this.buildPath(externalOrderId, action),
      baseUrl: this.config.apiBaseUrl,
      method: 'POST',
      accessToken: token,
      json: payload,
      idempotencyKey: UberOrderStateMachine.idempotencyKey(
        externalOrderId,
        action,
      ),
      kind: 'api',
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
