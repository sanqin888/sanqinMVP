import { Module } from '@nestjs/common';

import { PAYMENT_PROVIDER_WEBHOOK_INGRESS } from '../../application/payment-provider-webhook.port';
import {
  CloverPaymentProviderAdapter,
  CloverPlatformPaymentsGateway,
} from './clover-payment-provider.adapter';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import { CloverCredentialVaultService } from './oauth/clover-credential-vault.service';
import { CloverMerchantAccessTokenService } from './oauth/clover-merchant-access-token.service';
import { CloverMerchantAuthorizationService } from './oauth/clover-merchant-authorization.service';
import { CloverMerchantOAuthController } from './oauth/clover-merchant-oauth.controller';
import { CloverOAuthClient } from './oauth/clover-oauth.client';
import { CloverPlatformMerchantVerificationGateway } from './platform/clover-platform-merchant-verification.gateway';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';
import { CloverPaymentWebhookIngressAdapter } from './webhook/clover-payment-webhook-ingress.adapter';

@Module({
  controllers: [CloverMerchantOAuthController],
  providers: [
    CloverProviderConfig,
    {
      provide: CloverCredentialVaultService,
      useFactory: () => new CloverCredentialVaultService(process.env),
    },
    CloverOAuthClient,
    CloverPlatformMerchantVerificationGateway,
    CloverMerchantAuthorizationService,
    CloverMerchantAccessTokenService,
    CloverEcommerceTransport,
    CloverTerminalTransport,
    CloverPlatformPaymentsGateway,
    CloverPaymentProviderAdapter,
    CloverPaymentWebhookIngressAdapter,
    {
      provide: PAYMENT_PROVIDER_WEBHOOK_INGRESS,
      useExisting: CloverPaymentWebhookIngressAdapter,
    },
  ],
  exports: [
    CloverEcommerceTransport,
    CloverPaymentProviderAdapter,
    PAYMENT_PROVIDER_WEBHOOK_INGRESS,
  ],
})
export class CloverProviderInfrastructureModule {}
