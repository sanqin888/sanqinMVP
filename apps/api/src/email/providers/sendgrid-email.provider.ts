//apps/api/src/email/providers/sendgrid-email.provider.ts
import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import type {
  EmailProvider,
  EmailSendParams,
  EmailSendResult,
} from '../email.provider';

@Injectable()
export class SendGridEmailProvider implements EmailProvider {
  private readonly mailClient = sgMail as SendGridMailClient;
  private readonly defaultFromName =
    process.env.SENDGRID_FROM_NAME?.trim() || undefined;
  private readonly defaultFromAddress =
    process.env.SENDGRID_FROM_ADDRESS?.trim() || undefined;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();
    if (apiKey) {
      this.mailClient.setApiKey(apiKey);
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
      return {
        ok: false,
        error:
          'missing fromAddress (SENDGRID_FROM_ADDRESS or params.fromAddress)',
      };
    }

    try {
      const [res] = await this.mailClient.send({
        to: params.to,
        from: { name: fromName, email: fromAddress },
        subject: params.subject,
        html: params.html,
        text: params.text,

        categories: params.tags
          ? Object.entries(params.tags).map(([k, v]) => `sanq:${k}:${v}`)
          : undefined,

        customArgs: params.tags ?? undefined,
      });

      const messageId = getMessageId(res);

      return { ok: true, messageId };
    } catch (err: unknown) {
      const responseBody = getErrorResponseBody(err);
      const msg = responseBody
        ? responseBody
        : err instanceof Error
          ? err.message
          : String(err);
      return { ok: false, error: msg };
    }
  }
}

type SendGridMailAddress = {
  name: string;
  email: string;
};

type SendGridMailData = {
  to: string;
  from: SendGridMailAddress;
  subject: string;
  html?: string;
  text?: string;
  categories?: string[];
  customArgs?: Record<string, string>;
};

type SendGridMailClient = {
  setApiKey: (apiKey: string) => void;
  send: (message: SendGridMailData) => Promise<[SendGridResponse]>;
};

type SendGridResponse = {
  headers?: Record<string, string | string[] | undefined>;
};

const getMessageId = (
  response: SendGridResponse | undefined,
): string | undefined => {
  const headers = response?.headers;
  if (!headers) {
    return undefined;
  }

  const lowerCase = headers['x-message-id'];
  if (typeof lowerCase === 'string') {
    return lowerCase;
  }

  const upperCase = headers['X-Message-Id'];
  return typeof upperCase === 'string' ? upperCase : undefined;
};

const getErrorResponseBody = (err: unknown): string | undefined => {
  if (!isRecord(err)) {
    return undefined;
  }

  const response = err.response;
  if (!isRecord(response)) {
    return undefined;
  }

  const body = response.body;
  if (body === undefined) {
    return undefined;
  }

  return JSON.stringify(body);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
