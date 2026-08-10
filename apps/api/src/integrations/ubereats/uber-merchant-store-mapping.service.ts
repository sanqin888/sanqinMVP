import { Injectable } from '@nestjs/common';
import { UberMerchantGateway } from './uber-merchant.gateway';

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

@Injectable()
export class UberMerchantStoreMappingService {
  constructor(
    private readonly discover: DiscoverUberStoresUseCase,
    private readonly map: MapUberStoreUseCase,
  ) {}
  getMerchantStores(merchantUberUserId?: string) {
    return this.discover.getMerchantStores(merchantUberUserId);
  }
  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.map.updatePosExternalStoreId(uberStoreId, posExternalStoreId);
  }
}
