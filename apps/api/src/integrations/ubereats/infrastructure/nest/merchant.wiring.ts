import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../../application/shared/uber-telemetry.port';
import type { Provider } from '@nestjs/common';
import { UBER_EATS_STORE_STATUS_SYNC } from '../../public-api';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from '../../application/merchant/uber-merchant-oauth.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  RetrieveUberStoreIntegrationConfigUseCase,
  RetrieveUberStoreStatusUseCase,
  SyncUberStoreStatusUseCase,
  UpdateUberStoreIntegrationConfigUseCase,
  UpdateUberStorePrepTimeUseCase,
} from '../../application/merchant/uber-merchant-provisioning.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from '../../application/merchant/uber-merchant-store-mapping.service';
import { HandleUberMerchantWebhookHandler } from '../../application/merchant/uber-merchant-webhook.handler';
import {
  type UberMerchantApiPort,
  type UberOAuthTokenPort,
  type UberStoreApiPort,
  UBER_MERCHANT_API,
  UBER_OAUTH_TOKEN,
  UBER_STORE_API,
} from '../../application/merchant/uber-merchant-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberOAuthStatePort,
  type UberStoreMappingRepositoryPort,
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  UBER_STORE_MAPPING_REPOSITORY,
} from '../../application/merchant/uber-merchant-persistence.ports';
import {
  type UberOperationsAlertRepositoryPort,
  UBER_OPERATIONS_ALERT_REPOSITORY,
} from '../../application/operations/uber-operations-alert.ports';
import {
  type UberWebhookInboxPort,
  UBER_WEBHOOK_INBOX_PORT,
} from '../../application/orders/uber-order-processing.ports';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOAuthStatePrismaAdapter,
  UberOperationsAlertPrismaAdapter,
  UberStoreMappingPrismaAdapter,
} from '../../infrastructure/persistence/uber-merchant-persistence.adapter';
import {
  UberMerchantApiAdapter,
  UberOAuthTokenAdapter,
} from '../../infrastructure/uber-api/uber-merchant-api.adapter';
import { UBER_MERCHANT_CREDENTIAL_STORE } from '../uber-api/uber-merchant-credential.port';
import {
  UberMerchantResourceGateway,
  UberStoreGateway,
} from '../../infrastructure/uber-api/uber-resource.gateways';

export function createMerchantWiring(): Provider[] {
  return [
    UberMerchantResourceGateway,
    UberStoreGateway,
    UberOAuthTokenAdapter,
    { provide: UBER_OAUTH_TOKEN, useExisting: UberOAuthTokenAdapter },
    {
      provide: UBER_MERCHANT_CREDENTIAL_STORE,
      useExisting: UberMerchantConnectionPrismaAdapter,
    },
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
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberMerchantApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) => new DiscoverUberStoresUseCase(api, connections, mappings),
    },
    {
      provide: MapUberStoreUseCase,
      useFactory: (
        mappings: UberStoreMappingRepositoryPort,
        api: UberMerchantApiPort,
        connections: UberMerchantConnectionRepositoryPort,
      ) => new MapUberStoreUseCase(mappings, api, connections),
      inject: [
        UBER_STORE_MAPPING_REPOSITORY,
        UBER_MERCHANT_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
      ],
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
      provide: RetrieveUberStoreIntegrationConfigUseCase,
      inject: [
        UBER_STORE_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberStoreApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) =>
        new RetrieveUberStoreIntegrationConfigUseCase(
          api,
          connections,
          mappings,
        ),
    },
    {
      provide: UpdateUberStoreIntegrationConfigUseCase,
      inject: [
        UBER_STORE_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberStoreApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) =>
        new UpdateUberStoreIntegrationConfigUseCase(api, connections, mappings),
    },
    {
      provide: DeprovisionUberStoreUseCase,
      inject: [
        UBER_STORE_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberStoreApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) => new DeprovisionUberStoreUseCase(api, connections, mappings),
    },
    {
      provide: RetrieveUberStoreStatusUseCase,
      inject: [
        UBER_STORE_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberStoreApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) => new RetrieveUberStoreStatusUseCase(api, connections, mappings),
    },
    {
      provide: UpdateUberStorePrepTimeUseCase,
      inject: [
        UBER_STORE_API,
        UBER_MERCHANT_CONNECTION_REPOSITORY,
        UBER_STORE_MAPPING_REPOSITORY,
      ],
      useFactory: (
        api: UberStoreApiPort,
        connections: UberMerchantConnectionRepositoryPort,
        mappings: UberStoreMappingRepositoryPort,
      ) => new UpdateUberStorePrepTimeUseCase(api, connections, mappings),
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
      provide: UBER_EATS_STORE_STATUS_SYNC,
      useExisting: SyncUberStoreStatusUseCase,
    },
    {
      provide: HandleUberMerchantWebhookHandler,
      inject: [UBER_WEBHOOK_INBOX_PORT, UBER_TELEMETRY_PORT],
      useFactory: (inbox: UberWebhookInboxPort, telemetry: UberTelemetryPort) =>
        new HandleUberMerchantWebhookHandler(inbox, telemetry),
    },
  ];
}
