import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationRuntime } from './uber-integration.runtime';

/** OAuth, merchant discovery, provisioning and store state. */
@Injectable()
export class UberMerchantService {
  private readonly runtime: UberIntegrationRuntime;

  constructor(
    prisma: PrismaService,
    uberAuthService: UberAuthService,
    @Optional() orderEventsBus?: OrderEventsBus,
    @Optional() orderIngestionService?: OrderIngestionService,
    @Optional() httpClient?: UberHttpClient,
    @Optional() config?: UberConfigService,
  ) {
    this.runtime = new UberIntegrationRuntime(
      prisma,
      uberAuthService,
      orderEventsBus,
      orderIngestionService,
      httpClient,
      config,
    );
  }

  private consumeOAuthState(...args: unknown[]) {
    const runtime = this.runtime as unknown as {
      consumeOAuthState: (...values: unknown[]) => unknown;
    };
    return runtime.consumeOAuthState(...args);
  }

  buildMerchantAuthorizeUrl(
    ...args: Parameters<UberIntegrationRuntime['buildMerchantAuthorizeUrl']>
  ): ReturnType<UberIntegrationRuntime['buildMerchantAuthorizeUrl']> {
    return this.runtime.buildMerchantAuthorizeUrl(...args);
  }

  startMerchantOAuth(
    ...args: Parameters<UberIntegrationRuntime['startMerchantOAuth']>
  ): ReturnType<UberIntegrationRuntime['startMerchantOAuth']> {
    return this.runtime.startMerchantOAuth(...args);
  }

  exchangeAuthorizationCode(
    ...args: Parameters<UberIntegrationRuntime['exchangeAuthorizationCode']>
  ): ReturnType<UberIntegrationRuntime['exchangeAuthorizationCode']> {
    return this.runtime.exchangeAuthorizationCode(...args);
  }

  getMerchantStores(
    ...args: Parameters<UberIntegrationRuntime['getMerchantStores']>
  ): ReturnType<UberIntegrationRuntime['getMerchantStores']> {
    return this.runtime.getMerchantStores(...args);
  }

  updatePosExternalStoreId(
    ...args: Parameters<UberIntegrationRuntime['updatePosExternalStoreId']>
  ): ReturnType<UberIntegrationRuntime['updatePosExternalStoreId']> {
    return this.runtime.updatePosExternalStoreId(...args);
  }

  getMerchantConnectionStatus(
    ...args: Parameters<UberIntegrationRuntime['getMerchantConnectionStatus']>
  ): ReturnType<UberIntegrationRuntime['getMerchantConnectionStatus']> {
    return this.runtime.getMerchantConnectionStatus(...args);
  }

  provisionStore(
    ...args: Parameters<UberIntegrationRuntime['provisionStore']>
  ): ReturnType<UberIntegrationRuntime['provisionStore']> {
    return this.runtime.provisionStore(...args);
  }

  revokeOrDeprovisionStore(
    ...args: Parameters<UberIntegrationRuntime['revokeOrDeprovisionStore']>
  ): ReturnType<UberIntegrationRuntime['revokeOrDeprovisionStore']> {
    return this.runtime.revokeOrDeprovisionStore(...args);
  }

  syncStoreStatusToUber(
    ...args: Parameters<UberIntegrationRuntime['syncStoreStatusToUber']>
  ): ReturnType<UberIntegrationRuntime['syncStoreStatusToUber']> {
    return this.runtime.syncStoreStatusToUber(...args);
  }
}
