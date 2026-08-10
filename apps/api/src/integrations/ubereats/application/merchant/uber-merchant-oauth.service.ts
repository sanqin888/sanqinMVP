import { Injectable } from '@nestjs/common';
import { UberMerchantGateway } from '../../infrastructure/uber-api/uber-merchant.gateway';

export type UberOAuthErrorCode =
  | 'OAUTH_START_FAILED'
  | 'OAUTH_CODE_MISSING'
  | 'OAUTH_COMPLETION_FAILED';

export type UberOAuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: UberOAuthErrorCode } };

@Injectable()
export class StartUberOAuthUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}

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
      Awaited<ReturnType<UberMerchantGateway['startMerchantOAuth']>>
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
  constructor(private readonly gateway: UberMerchantGateway) {}
  async exchangeAuthorizationCode(
    code: string | undefined,
    state: string | undefined,
    adminSessionId: string | undefined,
    merchantContext?: string,
  ): Promise<
    UberOAuthResult<
      Awaited<ReturnType<UberMerchantGateway['exchangeAuthorizationCode']>>
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

/** OAuth application boundary; the two flows remain independently injectable. */
@Injectable()
export class UberMerchantOAuthService {
  constructor(
    private readonly start: StartUberOAuthUseCase,
    private readonly complete: CompleteUberOAuthUseCase,
  ) {}
  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    return this.start.buildMerchantAuthorizeUrl(
      adminSessionId,
      merchantContext,
    );
  }
  startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.start.startMerchantOAuth(adminSessionId, merchantContext);
  }
  exchangeAuthorizationCode(
    code: string | undefined,
    state?: string,
    adminSessionId?: string,
    merchantContext?: string,
  ) {
    return this.complete.exchangeAuthorizationCode(
      code,
      state,
      adminSessionId,
      merchantContext,
    );
  }
  getMerchantConnectionStatus(merchantUberUserId?: string) {
    return this.complete.getMerchantConnectionStatus(merchantUberUserId);
  }
}
