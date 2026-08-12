import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuthModule } from '../../../auth/auth.module';
import { MessagingModule } from '../../../messaging/messaging.module';
import { OrdersModule } from '../../../orders/orders.module';
import { BrowserWriteCsrfGuard } from '../api/ubereats-csrf.guard';
import { UBER_RATE_LIMITER_PORT } from '../application/ports/uber-rate-limiter.port';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../application/ports/uber-order-processing.ports';
import { UberConfigService } from '../infrastructure/config/uber-config.service';
import { UberCredentialVaultService } from '../infrastructure/crypto/uber-credential-vault.service';
import { HmacUberWebhookSignatureVerifier } from '../infrastructure/crypto/uber-webhook-signature-verifier';
import { UberTelemetryService } from '../infrastructure/persistence/uber-telemetry.service';
import { UberWebhookInboxPrismaAdapter } from '../infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { UberApiGatewayTransport } from '../infrastructure/uber-api/uber-api.gateway';
import { UberHttpClient } from '../infrastructure/uber-api/uber-http.client';
import { createUberRateLimiter } from '../infrastructure/uber-api/uber-rate-limiter.factory';
import { UberAuthService } from '../infrastructure/uber-api/uber-token.provider';

const INTERNAL_INFRASTRUCTURE_PROVIDERS = [
  {
    provide: UberConfigService,
    useFactory: () => new UberConfigService(process.env),
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
    inject: [UberConfigService, UberTelemetryService],
    useFactory: (config: UberConfigService, telemetry: UberTelemetryService) =>
      createUberRateLimiter(process.env, config, telemetry),
  },
  UberAuthService,
  UberApiGatewayTransport,
];

/** Shared implementation details. Feature modules can consume only these explicit exports. */
@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  providers: INTERNAL_INFRASTRUCTURE_PROVIDERS,
  exports: [
    UberConfigService,
    UberCredentialVaultService,
    BrowserWriteCsrfGuard,
    UberAuthService,
    UberHttpClient,
    UberApiGatewayTransport,
    UBER_RATE_LIMITER_PORT,
    UBER_TELEMETRY_PORT,
    UBER_WEBHOOK_INBOX_PORT,
    UBER_WEBHOOK_SIGNATURE_VERIFIER,
  ],
})
export class UberEatsInternalInfrastructureModule {}
