//apps/api/src/email/webhooks/sendgrid-email.webhook.verifier.ts
import { Injectable } from '@nestjs/common';
import { createVerify } from 'crypto';

@Injectable()
export class SendGridEmailWebhookVerifier {
  verifyOrThrow(params: {
    signatureBase64?: string;
    timestamp?: string;
    rawBody: Buffer;
    publicKey: string;
  }) {
    const { signatureBase64, timestamp, rawBody, publicKey } = params;

    if (!signatureBase64 || !timestamp) {
      throw new Error('missing sendgrid signature headers');
    }

    const signature = Buffer.from(signatureBase64, 'base64');

    // SendGrid Signed Event Webhook: verify signature over timestamp + rawBody
    const verifier = createVerify('sha256');
    verifier.update(timestamp);
    verifier.update(rawBody);

    const ok = verifier.verify(normalizePublicKey(publicKey), signature);
    if (!ok) throw new Error('invalid sendgrid webhook signature');
  }
}

function normalizePublicKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;

  // If env stores only base64 body, wrap it into PEM
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}
