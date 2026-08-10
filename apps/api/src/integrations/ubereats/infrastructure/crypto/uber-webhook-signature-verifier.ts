import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberWebhookSignatureVerifier } from '../../application/ports/uber-order-processing.ports';
import { UberAuthenticationError } from '../../application/errors/uber-application.error';
import {
  UberConfigService,
  type UberWebhookConfig,
} from '../config/uber-config.service';

@Injectable()
export class HmacUberWebhookSignatureVerifier implements UberWebhookSignatureVerifier {
  private readonly signingKey: string;
  constructor(@Inject(UberConfigService) config: UberWebhookConfig) {
    this.signingKey = config.getWebhookSigningKey();
  }
  verify(headers: Record<string, unknown>, rawBody: string | Buffer): void {
    const signature = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'x-uber-signature',
    )?.[1];
    const normalized =
      typeof signature === 'string' ? signature.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(normalized))
      throw new UberAuthenticationError({
        code: signature
          ? 'UBER_WEBHOOK_SIGNATURE_INVALID'
          : 'UBER_WEBHOOK_SIGNATURE_MISSING',
        message: signature
          ? 'Uber webhook signature is invalid'
          : 'Uber webhook signature is required',
        operation: 'webhook.verify-signature',
      });
    const expected = createHmac('sha256', this.signingKey)
      .update(rawBody)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(normalized, 'hex')))
      throw new UberAuthenticationError({
        code: 'UBER_WEBHOOK_SIGNATURE_INVALID',
        message: 'Uber webhook signature is invalid',
        operation: 'webhook.verify-signature',
      });
  }
}
