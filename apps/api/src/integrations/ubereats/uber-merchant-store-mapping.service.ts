import { Injectable } from '@nestjs/common';
import { UberMerchantInternalService } from './uber-merchant-internal.service';

/** Owns Uber store discovery, payload parsing, and local store mappings. */
@Injectable()
export class UberMerchantStoreMappingService {
  constructor(private readonly internal: UberMerchantInternalService) {}

  getMerchantStores(merchantUberUserId?: string) {
    return this.internal.getMerchantStores(merchantUberUserId);
  }

  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.internal.updatePosExternalStoreId(
      uberStoreId,
      posExternalStoreId,
    );
  }
}
