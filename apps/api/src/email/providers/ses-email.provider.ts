import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHmac, createHash } from 'crypto';
import { lastValueFrom } from 'rxjs';
import type {
  EmailProvider,
  EmailSendParams,
  EmailSendResult,
} from '../email.provider';

@Injectable()
export class SesEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SesEmailProvider.name);

  constructor(private readonly httpService: HttpService) {}

  async sendEmail(params: EmailSendParams): Promise<EmailSendResult> {
    const region = process.env.AWS_SES_REGION ?? 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    const fromEmail = process.env.AWS_SES_FROM_EMAIL;

    if (!accessKeyId || !secretAccessKey || !fromEmail) {
      return { ok: false, error: 'ses credentials missing' };
    }

    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
    const payload = {
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [params.to],
      },
      Content: {
        Simple: {
          Subject: { Data: params.subject },
          Body: {
            ...(params.html ? { Html: { Data: params.html } } : {}),
            ...(params.text ? { Text: { Data: params.text } } : {}),
          },
        },
      },
      ...(params.tags
        ? {
            EmailTags: Object.entries(params.tags).map(([Name, Value]) => ({
              Name,
              Value,
            })),
          }
        : {}),
    };

    const body = JSON.stringify(payload);
    const { headers } = this.signRequest({
      method: 'POST',
      url: endpoint,
      body,
      region,
      service: 'ses',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    });

    try {
      const response = await lastValueFrom(
        this.httpService.post(endpoint, body, {
          headers,
        }),
      );
      const messageId = response?.data?.MessageId ?? undefined;
      return { ok: true, messageId };
    } catch (error) {
      this.logger.error('SES send failed', error as Error);
      return { ok: false, error: 'ses send failed' };
    }
  }

  private signRequest(params: {
    method: string;
    url: string;
    body: string;
    region: string;
    service: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }): { headers: Record<string, string> } {
    const { method, url, body, region, service, accessKeyId, secretAccessKey } =
      params;
    const urlObj = new URL(url);
    const host = urlObj.host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\..+/g, '') + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.hash(body);

    const headers: Record<string, string> = {
      host,
      'content-type': 'application/json',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (params.sessionToken) {
      headers['x-amz-security-token'] = params.sessionToken;
    }

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((key) => `${key}:${headers[key]}`)
      .join('\n');

    const canonicalRequest = [
      method.toUpperCase(),
      urlObj.pathname,
      urlObj.searchParams.toString(),
      canonicalHeaders + '\n',
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.hash(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(
      secretAccessKey,
      dateStamp,
      region,
      service,
    );
    const signature = this.hmac(signingKey, stringToSign, 'hex');

    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { headers };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private hmac(
    key: string | Buffer,
    value: string,
    encoding: 'hex' | 'buffer',
  ) {
    const digest = createHmac('sha256', key).update(value, 'utf8');
    return encoding === 'hex' ? digest.digest('hex') : digest.digest();
  }

  private getSignatureKey(
    secret: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ): Buffer {
    const kDate = this.hmac(`AWS4${secret}`, dateStamp, 'buffer') as Buffer;
    const kRegion = this.hmac(kDate, regionName, 'buffer') as Buffer;
    const kService = this.hmac(kRegion, serviceName, 'buffer') as Buffer;
    return this.hmac(kService, 'aws4_request', 'buffer') as Buffer;
  }
}
