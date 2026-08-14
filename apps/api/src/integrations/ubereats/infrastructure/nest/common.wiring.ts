import { UBER_TELEMETRY_PORT } from '../../application/shared/uber-telemetry.port';
import { UBER_GATEWAY_AUDIT_PORT } from '../../application/shared/uber-gateway-audit.port';
import type { Provider } from '@nestjs/common';
import { BrowserWriteCsrfGuard } from '../../api/ubereats-csrf.guard';
import {
  UBER_RATE_LIMITER_PORT,
  type UberRateLimitCoordinationRepositoryPort,
} from '../../application/shared/uber-rate-limiter.port';
import {
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../../application/orders/uber-order-processing.ports';
import { UberCryptoConfigService } from '../../infrastructure/crypto/uber-crypto-config.service';
import { UberApiConfigService } from '../../infrastructure/uber-api/uber-api-config.service';
import { UberWorkerConfigService } from '../../infrastructure/workers/uber-worker-config.service';
import { UberCredentialVaultService } from '../../infrastructure/crypto/uber-credential-vault.service';
import { HmacUberWebhookSignatureVerifier } from '../../infrastructure/crypto/uber-webhook-signature-verifier';
import { UberTelemetryService } from '../../infrastructure/persistence/uber-telemetry.service';
import { UberGatewayAuditPrismaAdapter } from '../../infrastructure/persistence/uber-gateway-audit-prisma.adapter';
import { UberWebhookInboxPrismaAdapter } from '../../infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { UberRateLimitPrismaRepository } from '../../infrastructure/persistence/uber-rate-limit-prisma.repository';
import { UberApiGatewayTransport } from '../../infrastructure/uber-api/uber-api.gateway';
import { UberHttpClient } from '../../infrastructure/uber-api/uber-http.client';
import { createUberRateLimiter } from '../../infrastructure/uber-api/uber-rate-limiter.factory';
import { UberAuthService } from '../../infrastructure/uber-api/uber-token.provider';
import { UBER_EATS_STARTUP_CONFIG } from '../../infrastructure/config/uber-eats-startup-config.validator';

export function createCommonWiring(): Provider[] {
  return [
    {
      provide: UberApiConfigService,
      inject: [UBER_EATS_STARTUP_CONFIG],
      useFactory: () => new UberApiConfigService(process.env),
    },
    {
      provide: UberCryptoConfigService,
      inject: [UBER_EATS_STARTUP_CONFIG],
      useFactory: () => new UberCryptoConfigService(process.env),
    },
    {
      provide: UberWorkerConfigService,
      inject: [UBER_EATS_STARTUP_CONFIG],
      useFactory: () => new UberWorkerConfigService(process.env),
    },
    BrowserWriteCsrfGuard,
    {
      provide: UberCredentialVaultService,
      inject: [UBER_EATS_STARTUP_CONFIG],
      useFactory: () => new UberCredentialVaultService(process.env),
    },
    UberTelemetryService,
    { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
    UberGatewayAuditPrismaAdapter,
    {
      provide: UBER_GATEWAY_AUDIT_PORT,
      useExisting: UberGatewayAuditPrismaAdapter,
    },
    UberWebhookInboxPrismaAdapter,
    {
      provide: UBER_WEBHOOK_INBOX_PORT,
      useExisting: UberWebhookInboxPrismaAdapter,
    },
    HmacUberWebhookSignatureVerifier,
    {
      provide: UBER_WEBHOOK_SIGNATURE_VERIFIER,
      useExisting: HmacUberWebhookSignatureVerifier,
    },
    UberHttpClient,
    UberRateLimitPrismaRepository,
    {
      provide: UBER_RATE_LIMITER_PORT,
      inject: [
        UBER_EATS_STARTUP_CONFIG,
        UberApiConfigService,
        UberTelemetryService,
        UberRateLimitPrismaRepository,
      ],
      useFactory: (
        _startupConfig: void,
        config: UberApiConfigService,
        telemetry: UberTelemetryService,
        repository: UberRateLimitCoordinationRepositoryPort,
      ) => createUberRateLimiter(process.env, config, telemetry, repository),
    },
    UberAuthService,
    UberApiGatewayTransport,
  ];
}
