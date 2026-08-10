import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberWebhookSignatureVerifier } from '../../application/ports/uber-order-processing.ports';
import { UberConfigService, type UberWebhookConfig } from '../config/uber-config.service';

@Injectable()
export class HmacUberWebhookSignatureVerifier implements UberWebhookSignatureVerifier {
  private readonly signingKey: string;
  constructor(@Inject(UberConfigService) config: UberWebhookConfig) { this.signingKey = config.getWebhookSigningKey(); }
  verify(headers: Record<string, unknown>, rawBody: string | Buffer): void {
    const signature = Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-uber-signature')?.[1];
    const normalized = typeof signature === 'string' ? signature.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(normalized)) throw new UnauthorizedException(signature ? 'Invalid Uber signature' : 'Missing Uber signature header');
    const expected = createHmac('sha256', this.signingKey).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(normalized, 'hex'))) throw new UnauthorizedException('Invalid Uber signature');
  }
}
