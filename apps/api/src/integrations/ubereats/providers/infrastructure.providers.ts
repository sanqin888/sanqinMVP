import { UBER_TELEMETRY_PORT } from '../application/shared/uber-telemetry.port';
import type { Provider } from '@nestjs/common';
import { BrowserWriteCsrfGuard } from '../api/ubereats-csrf.guard';
import { UBER_RATE_LIMITER_PORT } from '../application/shared/uber-rate-limiter.port';
import {
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../application/orders/uber-order-processing.ports';
import { UberCryptoConfigService } from '../infrastructure/crypto/uber-crypto-config.service';
import { UberApiConfigService } from '../infrastructure/uber-api/uber-api-config.service';
import { UberWorkerConfigService } from '../infrastructure/workers/uber-worker-config.service';
import { UberCredentialVaultService } from '../infrastructure/crypto/uber-credential-vault.service';
import { HmacUberWebhookSignatureVerifier } from '../infrastructure/crypto/uber-webhook-signature-verifier';
import { UberTelemetryService } from '../infrastructure/persistence/uber-telemetry.service';
import { UberWebhookInboxPrismaAdapter } from '../infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { UberApiGatewayTransport } from '../infrastructure/uber-api/uber-api.gateway';
import { UberHttpClient } from '../infrastructure/uber-api/uber-http.client';
import { createUberRateLimiter } from '../infrastructure/uber-api/uber-rate-limiter.factory';
import { UberAuthService } from '../infrastructure/uber-api/uber-token.provider';

export const UBER_EATS_INFRASTRUCTURE_PROVIDERS: Provider[] = [
  {
    provide: UberApiConfigService,
    useFactory: () => new UberApiConfigService(process.env),
  },
  {
    provide: UberCryptoConfigService,
    useFactory: () => new UberCryptoConfigService(process.env),
  },
  {
    provide: UberWorkerConfigService,
    useFactory: () => new UberWorkerConfigService(process.env),
  },
  BrowserWriteCsrfGuard,
  {
    provide: UberCredentialVaultService,
    useFactory: () => new UberCredentialVaultService(process.env),
  },
  UberTelemetryService,
  { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
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
  {
    provide: UBER_RATE_LIMITER_PORT,
    inject: [UberApiConfigService, UberTelemetryService],
    useFactory: (
      config: UberApiConfigService,
      telemetry: UberTelemetryService,
    ) => createUberRateLimiter(process.env, config, telemetry),
  },
  UberAuthService,
  UberApiGatewayTransport,
];
