import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MERCHANT_GATEWAY,
  type UberMerchantGatewayPort,
} from '../ports/uber-api.ports';

export type UberStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};

/** Owns provisioning and Uber store-status synchronization. */
@Injectable()
export class ProvisionUberStoreUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  provisionStore(
    storeId: string,
    payload: Record<string, unknown> | undefined,
    merchantUberUserId?: string,
  ) {
    return this.gateway.provisionStore(
      storeId,
      payload ?? {},
      merchantUberUserId,
    );
  }
}

@Injectable()
export class DeprovisionUberStoreUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  revokeOrDeprovisionStore() {
    return this.gateway.revokeOrDeprovisionStore();
  }
}

@Injectable()
export class SyncUberStoreStatusUseCase {
  constructor(
    @Inject(UBER_MERCHANT_GATEWAY)
    private readonly gateway: UberMerchantGatewayPort,
  ) {}
  syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    return this.gateway.syncStoreStatusToUber(target);
  }
}
