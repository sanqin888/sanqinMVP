import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AccountingInboxTrustDecision } from '@prisma/client';
import {
  AccountingInboxAcquisitionService,
  extractMailboxAddress,
} from './accounting-inbox-acquisition.service';
import { AccountingOperationsService } from './accounting-operations.service';

const GMAIL_BILLS_LABEL = 'SanQ-Bills';

type GmailMessageList = {
  messages?: Array<{ id?: string }>;
  nextPageToken?: string;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  internalDate?: string;
  payload?: GmailPart;
};
type GmailAttachment = { data?: string; size?: number };
type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GmailIngestOptions = {
  accountingStartDate: string | null;
  timezone: string;
};

type MessageIngestResult = {
  imported: number;
  duplicates: number;
  failed: number;
  skippedBeforeStartDate: number;
};

type GmailAccountingAttachmentKind = 'PDF' | 'IMAGE' | 'CSV';

@Injectable()
export class AccountingGmailIngestService {
  private readonly logger = new Logger(AccountingGmailIngestService.name);

  constructor(
    private readonly acquisition: AccountingInboxAcquisitionService,
    private readonly operations: AccountingOperationsService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.ACCOUNTING_GMAIL_CLIENT_ID?.trim() &&
      process.env.ACCOUNTING_GMAIL_CLIENT_SECRET?.trim() &&
      process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN?.trim(),
    );
  }

  async ingestBillsMailbox(options: GmailIngestOptions): Promise<{
    configured: boolean;
    scannedMessages: number;
    importedDocuments: number;
    duplicateDocuments: number;
    failedDocuments: number;
    skippedBeforeStartDate: number;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        scannedMessages: 0,
        importedDocuments: 0,
        duplicateDocuments: 0,
        failedDocuments: 0,
        skippedBeforeStartDate: 0,
      };
    }

    const token = await this.getAccessToken();
    const mailbox =
      process.env.ACCOUNTING_GMAIL_ADDRESS?.trim() || 'bills@sanq.ca';
    const dateClause = this.gmailDateClause(options.accountingStartDate);
    const query = `{to:${mailbox} label:${GMAIL_BILLS_LABEL}} ${dateClause} -in:trash -in:spam`;
    const messageIds = await this.listMessageIds(token, query);
    let importedDocuments = 0;
    let duplicateDocuments = 0;
    let failedDocuments = 0;
    let skippedBeforeStartDate = 0;

    for (const messageId of messageIds) {
      try {
        const result = await this.ingestMessage(token, messageId, options);
        importedDocuments += result.imported;
        duplicateDocuments += result.duplicates;
        failedDocuments += result.failed;
        skippedBeforeStartDate += result.skippedBeforeStartDate;
      } catch (error) {
        failedDocuments += 1;
        this.logger.error(
          `Failed to ingest Gmail accounting message ${messageId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      configured: true,
      scannedMessages: messageIds.length,
      importedDocuments,
      duplicateDocuments,
      failedDocuments,
      skippedBeforeStartDate,
    };
  }

  private async ingestMessage(
    accessToken: string,
    messageId: string,
    options: GmailIngestOptions,
  ): Promise<MessageIngestResult> {
    const message = await this.gmailJson<GmailMessage>(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    if (!this.receivedOnOrAfterStartDate(message, options)) {
      return {
        imported: 0,
        duplicates: 0,
        failed: 0,
        skippedBeforeStartDate: 1,
      };
    }

    const subject = this.header(message.payload?.headers, 'subject');
    const senderEmail = extractMailboxAddress(
      this.header(message.payload?.headers, 'from'),
    );
    const trustDecision = senderEmail
      ? await this.operations.senderTrustDecision(senderEmail)
      : AccountingInboxTrustDecision.UNTRUSTED;
    const context = {
      messageId,
      senderEmail,
      subject,
      receivedAt: this.receivedAtIso(message),
    };
    const result: MessageIngestResult = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      skippedBeforeStartDate: 0,
    };

    const bodyText = await this.readMessageBody(
      accessToken,
      messageId,
      message.payload,
    );
    if (bodyText) {
      try {
        const body = await this.acquisition.acquireEmailBody(
          context,
          bodyText,
          trustDecision,
        );
        this.countAcquisition(body, result);
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Failed to ingest Gmail body ${messageId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const attachmentParts = this.flattenParts(message.payload).filter(
      (part) => part.body?.attachmentId && this.attachmentKind(part) != null,
    );
    for (const part of attachmentParts) {
      const attachmentId = part.body?.attachmentId;
      const kind = this.attachmentKind(part);
      if (!attachmentId || !kind) continue;
      try {
        const attachment = await this.gmailJson<GmailAttachment>(
          accessToken,
          `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        );
        if (!attachment.data) {
          result.failed += 1;
          continue;
        }
        const buffer = this.decodeBase64Url(attachment.data);
        const acquired = await this.acquisition.acquireEmailAttachment(
          context,
          attachmentId,
          {
            originalname:
              part.filename?.trim() ||
              `gmail-${attachmentId}.${kind === 'PDF' ? 'pdf' : kind === 'CSV' ? 'csv' : 'jpg'}`,
            mimetype: part.mimeType,
            buffer,
          },
          trustDecision,
        );
        this.countAcquisition(acquired, result);
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Failed to ingest Gmail attachment ${messageId}/${attachmentId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return result;
  }

  private countAcquisition(
    acquisition:
      | Awaited<
          ReturnType<AccountingInboxAcquisitionService['acquireEmailBody']>
        >
      | Awaited<
          ReturnType<
            AccountingInboxAcquisitionService['acquireEmailAttachment']
          >
        >,
    result: MessageIngestResult,
  ) {
    if (!acquisition) return;
    if (acquisition.replayed || acquisition.duplicateOfArtifactStableId) {
      result.duplicates += 1;
    } else {
      result.imported += 1;
    }
  }

  private gmailDateClause(accountingStartDate: string | null): string {
    if (!accountingStartDate) return 'newer_than:30d';
    const previousDay = DateTime.fromISO(accountingStartDate, {
      zone: 'utc',
    }).minus({ days: 1 });
    return `after:${previousDay.toFormat('yyyy/MM/dd')}`;
  }

  private receivedOnOrAfterStartDate(
    message: GmailMessage,
    options: GmailIngestOptions,
  ): boolean {
    if (!options.accountingStartDate || !message.internalDate) return true;
    const millis = Number(message.internalDate);
    if (!Number.isFinite(millis)) return true;
    const receivedDate = DateTime.fromMillis(millis, {
      zone: options.timezone,
    });
    if (!receivedDate.isValid) return true;
    const receivedDateKey = receivedDate.toISODate();
    return receivedDateKey
      ? receivedDateKey >= options.accountingStartDate
      : true;
  }

  private receivedAtIso(message: GmailMessage): string | null {
    const millis = Number(message.internalDate);
    if (!Number.isFinite(millis)) return null;
    const received = DateTime.fromMillis(millis, { zone: 'utc' });
    return received.isValid ? received.toISO() : null;
  }

  private async readMessageBody(
    accessToken: string,
    messageId: string,
    payload?: GmailPart,
  ): Promise<string> {
    const parts = this.flattenParts(payload).filter(
      (part) => !(part.filename?.trim() ?? ''),
    );
    const plainParts = parts.filter((part) => part.mimeType === 'text/plain');
    const htmlParts = parts.filter((part) => part.mimeType === 'text/html');
    const candidates = plainParts.length ? plainParts : htmlParts;
    const texts: string[] = [];
    for (const part of candidates) {
      const raw = await this.readPartData(accessToken, messageId, part);
      if (!raw) continue;
      const decoded = raw.toString('utf8');
      const text =
        part.mimeType === 'text/html'
          ? this.htmlToText(decoded)
          : decoded.trim();
      if (text) texts.push(text);
    }
    return Array.from(new Set(texts))
      .join('\n\n')
      .replace(/\s+\n/g, '\n')
      .trim();
  }

  private async readPartData(
    accessToken: string,
    messageId: string,
    part: GmailPart,
  ): Promise<Buffer | null> {
    if (part.body?.data) return this.decodeBase64Url(part.body.data);
    const attachmentId = part.body?.attachmentId;
    if (!attachmentId) return null;
    const attachment = await this.gmailJson<GmailAttachment>(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    return attachment.data ? this.decodeBase64Url(attachment.data) : null;
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/div\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.ACCOUNTING_GMAIL_CLIENT_ID?.trim();
    const clientSecret = process.env.ACCOUNTING_GMAIL_CLIENT_SECRET?.trim();
    const refreshToken = process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN?.trim();
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Accounting Gmail OAuth is not configured');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await this.fetchWithTimeout(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const tokenPayload = (await response
      .json()
      .catch(() => null)) as GoogleTokenResponse | null;
    if (!response.ok || !tokenPayload?.access_token) {
      throw new Error(
        `Gmail OAuth refresh failed (${response.status}): ${tokenPayload?.error_description ?? tokenPayload?.error ?? 'unknown error'}`,
      );
    }
    return tokenPayload.access_token;
  }

  private async listMessageIds(accessToken: string, query: string) {
    const result: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: query, maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.gmailJson<GmailMessageList>(
        accessToken,
        `/gmail/v1/users/me/messages?${params.toString()}`,
      );
      for (const message of page.messages ?? []) {
        if (message.id) result.push(message.id);
      }
      pageToken = page.nextPageToken;
    } while (pageToken && result.length < 500);
    return result.slice(0, 500);
  }

  private async gmailJson<T>(
    accessToken: string,
    pathName: string,
  ): Promise<T> {
    const response = await this.fetchWithTimeout(
      `https://gmail.googleapis.com${pathName}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Gmail API ${response.status}: ${detail.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  private attachmentKind(
    part: GmailPart,
  ): GmailAccountingAttachmentKind | null {
    const filename = part.filename?.trim().toLowerCase() ?? '';
    const mimeType = part.mimeType?.trim().toLowerCase() ?? '';
    if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
      return 'PDF';
    }
    if (
      mimeType === 'text/csv' ||
      mimeType === 'application/csv' ||
      filename.endsWith('.csv')
    ) {
      return 'CSV';
    }
    const isSupportedImage =
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/webp' ||
      /\.(?:jpe?g|png|webp)$/.test(filename);
    if (!isSupportedImage) return null;

    const disposition =
      this.header(part.headers, 'content-disposition')?.toLowerCase() ?? '';
    const reportedSize = part.body?.size ?? 0;
    const filenameLooksLikeBill =
      /(?:bill|invoice|receipt|statement|purchase|order|closeout|settlement)/i.test(
        filename,
      );
    const filenameLooksDecorative =
      /(?:logo|signature|spacer|icon|facebook|instagram|linkedin)/i.test(
        filename,
      );
    if (
      reportedSize > 0 &&
      reportedSize < 100_000 &&
      !filenameLooksLikeBill &&
      (disposition.includes('inline') || filenameLooksDecorative)
    ) {
      return null;
    }
    return 'IMAGE';
  }

  private flattenParts(part?: GmailPart): GmailPart[] {
    if (!part) return [];
    return [
      part,
      ...(part.parts ?? []).flatMap((child) => this.flattenParts(child)),
    ];
  }

  private header(headers: GmailHeader[] | undefined, name: string) {
    return (
      headers?.find(
        (header) => header.name?.toLowerCase() === name.toLowerCase(),
      )?.value ?? null
    );
  }

  private decodeBase64Url(value: string): Buffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64');
  }

  private async fetchWithTimeout(url: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
