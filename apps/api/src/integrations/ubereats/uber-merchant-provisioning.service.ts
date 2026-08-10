import { Injectable } from '@nestjs/common';
import { UberMerchantInternalService } from './uber-merchant-internal.service';

export type UberStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};

/** Owns provisioning and Uber store-status synchronization. */
@Injectable()
export class UberMerchantProvisioningService {
  constructor(private readonly internal: UberMerchantInternalService) {}

  provisionStore(
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    return this.internal.provisionStore(storeId, payload, merchantUberUserId);
  }

  revokeOrDeprovisionStore() {
    return this.internal.revokeOrDeprovisionStore();
  }

  syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    return this.internal.syncStoreStatusToUber(target);
  }
}
