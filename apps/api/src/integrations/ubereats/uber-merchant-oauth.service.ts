import { Injectable } from '@nestjs/common';
import { UberMerchantInternalService } from './uber-merchant-internal.service';

/** Owns the merchant OAuth lifecycle, including state validation and auth errors. */
@Injectable()
export class UberMerchantOAuthService {
  constructor(private readonly internal: UberMerchantInternalService) {}

  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    return this.internal.buildMerchantAuthorizeUrl(
      adminSessionId,
      merchantContext,
    );
  }

  startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.internal.startMerchantOAuth(adminSessionId, merchantContext);
  }

  exchangeAuthorizationCode(
    code: string,
    state: string | undefined,
    adminSessionId: string | undefined,
  ) {
    return this.internal.exchangeAuthorizationCode(code, state, adminSessionId);
  }
}
