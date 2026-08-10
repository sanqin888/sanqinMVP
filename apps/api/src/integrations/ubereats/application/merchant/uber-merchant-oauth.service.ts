import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MERCHANT_GATEWAY,
  type UberMerchantGatewayPort,
} from '../ports/uber-api.ports';

export type UberOAuthErrorCode =
  | 'OAUTH_START_FAILED'
  | 'OAUTH_CODE_MISSING'
  | 'OAUTH_COMPLETION_FAILED';

export type UberOAuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: UberOAuthErrorCode } };

@Injectable()
export class StartUberOAuthUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}

  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    return this.gateway.buildMerchantAuthorizeUrl(
      adminSessionId,
      merchantContext,
    );
  }

  async startMerchantOAuth(
    adminSessionId: string,
    merchantContext?: string,
  ): Promise<
    UberOAuthResult<
      Awaited<ReturnType<UberMerchantGatewayPort['startMerchantOAuth']>>
    >
  > {
    try {
      return {
        ok: true,
        value: await this.gateway.startMerchantOAuth(
          adminSessionId,
          merchantContext,
        ),
      };
    } catch {
      return { ok: false, error: { code: 'OAUTH_START_FAILED' } };
    }
  }
}

@Injectable()
export class CompleteUberOAuthUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  async exchangeAuthorizationCode(
    code: string | undefined,
    state: string | undefined,
    adminSessionId: string | undefined,
    merchantContext?: string,
  ): Promise<
    UberOAuthResult<
      Awaited<ReturnType<UberMerchantGatewayPort['exchangeAuthorizationCode']>>
    >
  > {
    if (!code) return { ok: false, error: { code: 'OAUTH_CODE_MISSING' } };
    try {
      return {
        ok: true,
        value: await this.gateway.exchangeAuthorizationCode(
          code,
          state,
          adminSessionId,
          merchantContext,
        ),
      };
    } catch {
      return { ok: false, error: { code: 'OAUTH_COMPLETION_FAILED' } };
    }
  }

  getMerchantConnectionStatus(merchantUberUserId?: string) {
    return this.gateway.getMerchantConnectionStatus(merchantUberUserId);
  }
}
