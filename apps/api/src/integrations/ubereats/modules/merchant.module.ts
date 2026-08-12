import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from '../application/merchant/uber-merchant-oauth.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from '../application/merchant/uber-merchant-provisioning.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from '../application/merchant/uber-merchant-store-mapping.service';
import { HandleUberMerchantWebhookHandler } from '../application/merchant/uber-merchant-webhook.handler';
import {
  type UberMerchantApiPort,
  type UberOAuthTokenPort,
  type UberStoreApiPort,
  UBER_MERCHANT_API,
  UBER_OAUTH_TOKEN,
  UBER_STORE_API,
} from '../application/ports/uber-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberOAuthStatePort,
  type UberOperationsAlertRepositoryPort,
  type UberStoreMappingRepositoryPort,
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  UBER_OPERATIONS_ALERT_REPOSITORY,
  UBER_STORE_MAPPING_REPOSITORY,
} from '../application/ports/uber-persistence.ports';
import {
  type UberTelemetryPort,
  type UberWebhookInboxPort,
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
} from '../application/ports/uber-order-processing.ports';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOAuthStatePrismaAdapter,
  UberOperationsAlertPrismaAdapter,
  UberStoreMappingPrismaAdapter,
} from '../infrastructure/persistence/uber-merchant-persistence.adapter';
import {
  UberMerchantApiAdapter,
  UberOAuthTokenAdapter,
} from '../infrastructure/uber-api/uber-merchant-api.adapter';
import {
  UberMerchantResourceGateway,
  UberStoreGateway,
} from '../infrastructure/uber-api/uber-resource.gateways';
import { UberEatsInternalInfrastructureModule } from './ubereats-internal-infrastructure.module';

export const UBER_EATS_MERCHANT_PROVIDERS = [
  UberMerchantResourceGateway,
  UberStoreGateway,
  UberOAuthTokenAdapter,
  { provide: UBER_OAUTH_TOKEN, useExisting: UberOAuthTokenAdapter },
  UberMerchantApiAdapter,
  { provide: UBER_MERCHANT_API, useExisting: UberMerchantApiAdapter },
  { provide: UBER_STORE_API, useExisting: UberMerchantApiAdapter },
  UberOAuthStatePrismaAdapter,
  {
    provide: UBER_OAUTH_STATE_REPOSITORY,
    useExisting: UberOAuthStatePrismaAdapter,
  },
  UberMerchantConnectionPrismaAdapter,
  {
    provide: UBER_MERCHANT_CONNECTION_REPOSITORY,
    useExisting: UberMerchantConnectionPrismaAdapter,
  },
  UberStoreMappingPrismaAdapter,
  {
    provide: UBER_STORE_MAPPING_REPOSITORY,
    useExisting: UberStoreMappingPrismaAdapter,
  },
  UberOperationsAlertPrismaAdapter,
  {
    provide: UBER_OPERATIONS_ALERT_REPOSITORY,
    useExisting: UberOperationsAlertPrismaAdapter,
  },
  {
    provide: StartUberOAuthUseCase,
    inject: [UBER_OAUTH_TOKEN, UBER_OAUTH_STATE_REPOSITORY],
    useFactory: (tokens: UberOAuthTokenPort, states: UberOAuthStatePort) =>
      new StartUberOAuthUseCase(tokens, states),
  },
  {
    provide: CompleteUberOAuthUseCase,
    inject: [
      UBER_OAUTH_TOKEN,
      UBER_OAUTH_STATE_REPOSITORY,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
    ],
    useFactory: (
      tokens: UberOAuthTokenPort,
      states: UberOAuthStatePort,
      connections: UberMerchantConnectionRepositoryPort,
    ) => new CompleteUberOAuthUseCase(tokens, states, connections),
  },
  {
    provide: DiscoverUberStoresUseCase,
    inject: [
      UBER_MERCHANT_API,
      UBER_OAUTH_TOKEN,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      api: UberMerchantApiPort,
      tokens: UberOAuthTokenPort,
      connections: UberMerchantConnectionRepositoryPort,
      mappings: UberStoreMappingRepositoryPort,
    ) => new DiscoverUberStoresUseCase(api, tokens, connections, mappings),
  },
  {
    provide: MapUberStoreUseCase,
    inject: [UBER_STORE_MAPPING_REPOSITORY],
    useFactory: (mappings: UberStoreMappingRepositoryPort) =>
      new MapUberStoreUseCase(mappings),
  },
  {
    provide: ProvisionUberStoreUseCase,
    inject: [
      UBER_STORE_API,
      UBER_MERCHANT_CONNECTION_REPOSITORY,
      UBER_STORE_MAPPING_REPOSITORY,
    ],
    useFactory: (
      api: UberStoreApiPort,
      connections: UberMerchantConnectionRepositoryPort,
      mappings: UberStoreMappingRepositoryPort,
    ) => new ProvisionUberStoreUseCase(api, connections, mappings),
  },
  {
    provide: DeprovisionUberStoreUseCase,
    useFactory: () => new DeprovisionUberStoreUseCase(),
  },
  {
    provide: SyncUberStoreStatusUseCase,
    inject: [
      UBER_STORE_API,
      UBER_STORE_MAPPING_REPOSITORY,
      UBER_OPERATIONS_ALERT_REPOSITORY,
    ],
    useFactory: (
      api: UberStoreApiPort,
      mappings: UberStoreMappingRepositoryPort,
      alerts: UberOperationsAlertRepositoryPort,
    ) => new SyncUberStoreStatusUseCase(api, mappings, alerts),
  },
  {
    provide: HandleUberMerchantWebhookHandler,
    inject: [UBER_WEBHOOK_INBOX_PORT, UBER_TELEMETRY_PORT],
    useFactory: (inbox: UberWebhookInboxPort, telemetry: UberTelemetryPort) =>
      new HandleUberMerchantWebhookHandler(inbox, telemetry),
  },
];

export const UBER_EATS_MERCHANT_EXPORTS = [
  StartUberOAuthUseCase,
  CompleteUberOAuthUseCase,
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  ProvisionUberStoreUseCase,
  DeprovisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  HandleUberMerchantWebhookHandler,
];

@Module({
  imports: [PrismaModule, UberEatsInternalInfrastructureModule],
  providers: UBER_EATS_MERCHANT_PROVIDERS,
  exports: UBER_EATS_MERCHANT_EXPORTS,
})
export class UberEatsMerchantModule {}
