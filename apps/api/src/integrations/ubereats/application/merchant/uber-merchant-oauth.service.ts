import { Injectable } from '@nestjs/common';
import { UberMerchantGateway } from '../../infrastructure/api/uber-merchant.gateway';

@Injectable()
export class StartUberOAuthUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}

  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    return this.gateway.buildMerchantAuthorizeUrl(
      adminSessionId,
      merchantContext,
    );
  }

  startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.gateway.startMerchantOAuth(adminSessionId, merchantContext);
  }
}

@Injectable()
export class CompleteUberOAuthUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  exchangeAuthorizationCode(
    code: string,
    state: string | undefined,
    adminSessionId: string | undefined,
    merchantContext?: string,
  ) {
    return this.gateway.exchangeAuthorizationCode(
      code,
      state,
      adminSessionId,
      merchantContext,
    );
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
    code: string,
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
