import { Injectable } from '@nestjs/common';
import { UberMerchantGateway } from '../../infrastructure/uber-api/uber-merchant.gateway';

/** Owns Uber store discovery, payload parsing, and local store mappings. */
@Injectable()
export class DiscoverUberStoresUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  getMerchantStores(merchantUberUserId?: string) {
    return this.gateway.getMerchantStores(merchantUberUserId);
  }
}

@Injectable()
export class MapUberStoreUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.gateway.updatePosExternalStoreId(
      uberStoreId,
      posExternalStoreId,
    );
  }
}
