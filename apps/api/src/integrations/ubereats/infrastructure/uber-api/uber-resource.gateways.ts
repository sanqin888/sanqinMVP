import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import {
  UberApiGatewayTransport,
  type UberGatewayRequest,
  type UberResourceGateway,
} from './uber-api.gateway';
import type { UberOrderActionGatewayPort } from '../../application/ports/uber-api.ports';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';

abstract class PrefixGateway implements UberResourceGateway {
  protected abstract readonly prefixes: readonly string[];
  constructor(protected readonly transport: UberApiGatewayTransport) {}

  request<T = Record<string, unknown>>(
    request: UberGatewayRequest,
  ): Promise<T> {
    if (!this.prefixes.some((prefix) => request.path.startsWith(prefix)))
      throw new BadRequestException('Uber resource path 不属于此 gateway');
    return this.transport.request<T>(request);
  }
}

@Injectable()
export class UberMerchantResourceGateway extends PrefixGateway {
  protected readonly prefixes = ['/v1/eats/stores'] as const;
}

@Injectable()
export class UberStoreGateway extends PrefixGateway {
  protected readonly prefixes = ['/v1/eats/stores'] as const;
}

@Injectable()
export class UberMenuGateway extends PrefixGateway {
  protected readonly prefixes = ['/v2/eats/stores'] as const;
}

@Injectable()
export class UberOrderGateway
  extends PrefixGateway
  implements UberOrderActionGatewayPort
{
  protected readonly prefixes = [
    '/v1/eats/orders',
    '/v1/delivery/order',
    '/v2/eats/order',
  ] as const;

  constructor(
    transport: UberApiGatewayTransport,
    private readonly config: { resourceHrefAllowedOrigins: string },
  ) {
    super(transport);
  }

  async pathFromResourceHref(resourceHref: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(resourceHref);
    } catch {
      throw new BadRequestException('Uber resource_href 无效');
    }
    const allowed = new Set(
      this.config.resourceHrefAllowedOrigins
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new URL(value).origin),
    );
    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password ||
      !allowed.has(url.origin)
    )
      throw new BadRequestException('Uber resource_href 不属于允许的来源');

    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => !this.isPublic(address))
    )
      throw new BadRequestException('Uber resource_href 地址不安全');
    const path = `${url.pathname}${url.search}`;
    if (!this.prefixes.some((prefix) => path.startsWith(prefix)))
      throw new BadRequestException('Uber resource_href path 不受支持');
    return path;
  }

  inspect<T>(request: UberGatewayRequest) {
    if (!this.prefixes.some((prefix) => request.path.startsWith(prefix)))
      throw new BadRequestException('Uber order path 不受支持');
    return this.transport.inspect<T>(request);
  }

  async executeAction(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const id = encodeURIComponent(externalOrderId);
    const path = {
      ACCEPT: `/v1/eats/orders/${id}/accept_pos_order`,
      DENY: `/v1/eats/orders/${id}/deny_pos_order`,
      READY_FOR_PICKUP: `/v1/delivery/order/${id}/ready`,
    }[action];
    const result = await this.inspect({
      path,
      method: 'POST',
      operation: `uber.order.${action.toLowerCase()}`,
      scope: 'eats.order',
      partitionKey: externalOrderId,
      json: payload,
      idempotencyKey,
    });
    return {
      ok: result.response.ok,
      status: result.response.status,
      data: result.data,
    };
  }

  private isPublic(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.includes(':'))
      return !(
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
      );
    const octets = normalized.split('.').map(Number);
    return !(
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
}
