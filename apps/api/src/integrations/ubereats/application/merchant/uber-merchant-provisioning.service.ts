import { Injectable } from '@nestjs/common';
import { UberMerchantGateway } from '../../infrastructure/uber-api/uber-merchant.gateway';

export type UberStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};

/** Owns provisioning and Uber store-status synchronization. */
@Injectable()
export class ProvisionUberStoreUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  provisionStore(
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    return this.gateway.provisionStore(storeId, payload, merchantUberUserId);
  }
}

@Injectable()
export class DeprovisionUberStoreUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  revokeOrDeprovisionStore() {
    return this.gateway.revokeOrDeprovisionStore();
  }
}

@Injectable()
export class SyncUberStoreStatusUseCase {
  constructor(private readonly gateway: UberMerchantGateway) {}
  syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    return this.gateway.syncStoreStatusToUber(target);
  }
}

@Injectable()
export class UberMerchantProvisioningService {
  constructor(
    private readonly provision: ProvisionUberStoreUseCase,
    private readonly deprovision: DeprovisionUberStoreUseCase,
    private readonly syncStatus: SyncUberStoreStatusUseCase,
  ) {}
  provisionStore(
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    return this.provision.provisionStore(storeId, payload, merchantUberUserId);
  }
  revokeOrDeprovisionStore() {
    return this.deprovision.revokeOrDeprovisionStore();
  }
  syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    return this.syncStatus.syncStoreStatusToUber(target);
  }
}
