import { Injectable } from '@nestjs/common';
import { UberEatsService } from './ubereats.service';

/** OAuth, discovery, provisioning and store-state boundary. */
@Injectable()
export class UberMerchantService {
  constructor(private readonly facade: UberEatsService) {}

  buildMerchantAuthorizeUrl(
    ...args: Parameters<UberEatsService['buildMerchantAuthorizeUrl']>
  ) {
    return this.facade.buildMerchantAuthorizeUrl(...args);
  }
  startMerchantOAuth(
    ...args: Parameters<UberEatsService['startMerchantOAuth']>
  ) {
    return this.facade.startMerchantOAuth(...args);
  }
  exchangeAuthorizationCode(
    ...args: Parameters<UberEatsService['exchangeAuthorizationCode']>
  ) {
    return this.facade.exchangeAuthorizationCode(...args);
  }
  getMerchantStores(...args: Parameters<UberEatsService['getMerchantStores']>) {
    return this.facade.getMerchantStores(...args);
  }
  updatePosExternalStoreId(
    ...args: Parameters<UberEatsService['updatePosExternalStoreId']>
  ) {
    return this.facade.updatePosExternalStoreId(...args);
  }
  getMerchantConnectionStatus(
    ...args: Parameters<UberEatsService['getMerchantConnectionStatus']>
  ) {
    return this.facade.getMerchantConnectionStatus(...args);
  }
  provisionStore(...args: Parameters<UberEatsService['provisionStore']>) {
    return this.facade.provisionStore(...args);
  }
  revokeOrDeprovisionStore() {
    return this.facade.revokeOrDeprovisionStore();
  }
  syncStoreStatusToUber() {
    return this.facade.syncStoreStatusToUber();
  }
}
