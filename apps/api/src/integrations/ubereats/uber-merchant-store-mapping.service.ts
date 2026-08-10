import { Injectable } from '@nestjs/common';
import { UberMerchantInternalService } from './uber-merchant-internal.service';

/** Owns Uber store discovery, payload parsing, and local store mappings. */
@Injectable()
export class UberMerchantStoreMappingService {
  constructor(private readonly internal: UberMerchantInternalService) {}

  getMerchantStores(accessToken?: string, merchantUberUserId?: string) {
    return this.internal.getMerchantStores(accessToken, merchantUberUserId);
  }

  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.internal.updatePosExternalStoreId(
      uberStoreId,
      posExternalStoreId,
    );
  }
}
