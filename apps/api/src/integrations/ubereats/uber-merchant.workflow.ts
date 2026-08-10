import { Injectable } from '@nestjs/common';
import { UberMerchantOAuthService } from './uber-merchant-oauth.service';
import {
  UberMerchantProvisioningService,
  type UberStoreStatusTarget,
} from './uber-merchant-provisioning.service';
import { UberMerchantStoreMappingService } from './uber-merchant-store-mapping.service';
import { UberMerchantInternalService } from './uber-merchant-internal.service';

/** Public merchant facade. It preserves the API while delegating focused use cases. */
@Injectable()
export class UberMerchantService {
  constructor(
    private readonly oauth: UberMerchantOAuthService,
    private readonly stores: UberMerchantStoreMappingService,
    private readonly provisioning: UberMerchantProvisioningService,
    private readonly internal: UberMerchantInternalService,
  ) {}

  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    return this.oauth.buildMerchantAuthorizeUrl(
      adminSessionId,
      merchantContext,
    );
  }
  startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.oauth.startMerchantOAuth(adminSessionId, merchantContext);
  }
  exchangeAuthorizationCode(
    code: string,
    state: string | undefined,
    adminSessionId: string | undefined,
  ) {
    return this.oauth.exchangeAuthorizationCode(code, state, adminSessionId);
  }
  getMerchantStores(merchantUberUserId?: string) {
    return this.stores.getMerchantStores(merchantUberUserId);
  }
  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.stores.updatePosExternalStoreId(
      uberStoreId,
      posExternalStoreId,
    );
  }
  getMerchantConnectionStatus(merchantUberUserId?: string) {
    return this.internal.getMerchantConnectionStatus(merchantUberUserId);
  }
  provisionStore(
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    return this.provisioning.provisionStore(
      storeId,
      payload,
      merchantUberUserId,
    );
  }
  revokeOrDeprovisionStore() {
    return this.provisioning.revokeOrDeprovisionStore();
  }
  syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    return this.provisioning.syncStoreStatusToUber(target);
  }
}
