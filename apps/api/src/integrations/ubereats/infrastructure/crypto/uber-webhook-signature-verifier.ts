import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberWebhookSignatureVerifier } from '../../application/ports/uber-order-processing.ports';
import { UberAuthenticationError } from '../../application/errors/uber-application.error';
import {
  UberCryptoConfigService,
  type UberWebhookSigningSecrets,
} from './uber-crypto-config.service';
import {
  UBER_WEBHOOK_SIGNATURE_VERSION,
  type UberWebhookVerificationInput,
} from '../../domain/webhook/uber-webhook.types';

@Injectable()
export class HmacUberWebhookSignatureVerifier implements UberWebhookSignatureVerifier {
  private readonly signingSecrets: UberWebhookSigningSecrets;
  constructor(
    @Inject(UberCryptoConfigService) config: UberCryptoConfigService,
    private readonly now: () => number = Date.now,
  ) {
    this.signingSecrets = config.getWebhookSigningSecrets();
  }

  verify(input: UberWebhookVerificationInput): void {
    if (input.version !== UBER_WEBHOOK_SIGNATURE_VERSION) {
      this.reject('UBER_WEBHOOK_SIGNATURE_VERSION_UNSUPPORTED');
    }
    const matchingHeaders = Object.entries(input.headers).filter(
      ([name]) => name.toLowerCase() === 'x-uber-signature',
    );
    if (matchingHeaders.length === 0)
      this.reject('UBER_WEBHOOK_SIGNATURE_MISSING');
    if (
      matchingHeaders.length !== 1 ||
      typeof matchingHeaders[0][1] !== 'string' ||
      matchingHeaders[0][1].includes(',')
    ) {
      this.reject('UBER_WEBHOOK_SIGNATURE_AMBIGUOUS');
    }

    const signature = matchingHeaders[0][1].trim().toLowerCase();
    // Uber v1 是 64 个十六进制字符；任何 sha512=、v2= 等前缀均明确拒绝。
    if (!/^[0-9a-f]{64}$/.test(signature)) {
      this.reject('UBER_WEBHOOK_SIGNATURE_FORMAT_INVALID');
    }
    const received = Buffer.from(signature, 'hex');
    const candidates = [this.signingSecrets.active];
    if (
      this.signingSecrets.previous &&
      this.now() <= this.signingSecrets.previous.validUntilEpochMs
    ) {
      candidates.push(this.signingSecrets.previous.secret);
    }
    let valid = false;
    for (const secret of candidates) {
      const expected = createHmac('sha256', secret)
        .update(input.rawBody)
        .digest();
      // 不提前返回，避免从比较次数暴露当前使用 active 还是 previous。
      valid = timingSafeEqual(expected, received) || valid;
    }
    if (!valid) this.reject('UBER_WEBHOOK_SIGNATURE_MISMATCH');
  }

  private reject(code: string): never {
    throw new UberAuthenticationError({
      code,
      message:
        code === 'UBER_WEBHOOK_SIGNATURE_MISSING'
          ? 'Uber webhook signature is required'
          : 'Uber webhook signature is invalid',
      operation: 'webhook.verify-signature',
    });
  }
}
