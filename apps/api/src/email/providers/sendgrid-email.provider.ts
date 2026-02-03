//apps/api/src/email/providers/sendgrid-email.provider.ts
import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import type { EmailProvider, EmailSendParams, EmailSendResult } from '../email.provider';

@Injectable()
export class SendGridEmailProvider implements EmailProvider {
  private readonly defaultFromName = process.env.SENDGRID_FROM_NAME?.trim() || undefined;
  private readonly defaultFromAddress = process.env.SENDGRID_FROM_ADDRESS?.trim() || undefined;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
  }

  async sendEmail(params: EmailSendParams): Promise<EmailSendResult> {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, error: 'missing SENDGRID_API_KEY' };
    }

    const fromName = params.fromName ?? this.defaultFromName ?? 'SanQ';
    const fromAddress = params.fromAddress ?? this.defaultFromAddress;
    if (!fromAddress) {
      return { ok: false, error: 'missing fromAddress (SENDGRID_FROM_ADDRESS or params.fromAddress)' };
    }

    try {
      const [res] = await sgMail.send({
        to: params.to,
        from: { name: fromName, email: fromAddress },
        subject: params.subject,
        html: params.html,
        text: params.text,
        // 如果你未来要用 SendGrid categories / custom args，可在这里接 tags
        // categories: params.tags ? Object.entries(params.tags).map(([k,v]) => `${k}:${v}`) : undefined,
        // customArgs: params.tags ?? undefined,
      });

      const messageId =
        (res?.headers as any)?.['x-message-id'] ||
        (res?.headers as any)?.['X-Message-Id'] ||
        undefined;

      return { ok: true, messageId };
    } catch (err: any) {
      const msg = err?.response?.body
        ? JSON.stringify(err.response.body)
        : (err instanceof Error ? err.message : String(err));
      return { ok: false, error: msg };
    }
  }
}
