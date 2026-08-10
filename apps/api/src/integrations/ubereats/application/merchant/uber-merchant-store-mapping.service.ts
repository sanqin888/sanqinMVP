import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MERCHANT_GATEWAY,
  type UberMerchantGatewayPort,
} from '../ports/uber-api.ports';

/** Owns Uber store discovery, payload parsing, and local store mappings. */
@Injectable()
export class DiscoverUberStoresUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  getMerchantStores(merchantUberUserId?: string) {
    return this.gateway.getMerchantStores(merchantUberUserId);
  }
}

@Injectable()
export class MapUberStoreUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  updatePosExternalStoreId(uberStoreId: string, posExternalStoreId: string) {
    return this.gateway.updatePosExternalStoreId(
      uberStoreId,
      posExternalStoreId,
    );
  }
}
