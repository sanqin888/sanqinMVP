import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AccountingInboxTrustDecision } from './accounting-contracts';
import {
  AccountingInboxAcquisitionService,
  extractMailboxAddress,
} from './accounting-inbox-acquisition.service';
import { AccountingInboxService } from './accounting-inbox.service';
import {
  CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE,
  isCloverCloseoutEmailEvidence,
} from './accounting-clover-closeout.contract';
import { PROVIDER_FINANCIAL_HISTORY_START_DATE } from './accounting-inbox-core.policy';

const GMAIL_BILLS_LABEL = 'SanQ-Bills';

type GmailMessageList = {
  messages?: Array<{ id?: string }>;
  nextPageToken?: string;
};

type GmailProfile = { historyId?: string };

type GmailLabelList = {
  labels?: Array<{ id?: string; name?: string }>;
};

type GmailHistoryList = {
  history?: Array<{
    messagesAdded?: Array<{ message?: { id?: string } }>;
    labelsAdded?: Array<{ message?: { id?: string } }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
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
  labelIds?: string[];
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
  historyId?: string | null;
};

type MessageIngestResult = {
  imported: number;
  duplicates: number;
  failed: number;
  skippedBeforeStartDate: number;
};

type GmailAccountingAttachmentKind = 'PDF' | 'IMAGE' | 'CSV';
type GmailSyncMode = 'BOOTSTRAP' | 'INCREMENTAL';

const MAX_GMAIL_SYNC_MESSAGES = 5_000;

class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class AccountingGmailIngestService {
  private readonly logger = new Logger(AccountingGmailIngestService.name);

  constructor(
    private readonly acquisition: AccountingInboxAcquisitionService,
    private readonly inbox: AccountingInboxService,
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
    syncMode: GmailSyncMode | null;
    nextHistoryId: string | null;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        scannedMessages: 0,
        importedDocuments: 0,
        duplicateDocuments: 0,
        failedDocuments: 0,
        skippedBeforeStartDate: 0,
        syncMode: null,
        nextHistoryId: null,
      };
    }

    const token = await this.getAccessToken();
    const mailbox =
      process.env.ACCOUNTING_GMAIL_ADDRESS?.trim() || 'bills@sanq.ca';
    const syncBatch = await this.resolveSyncBatch(token, mailbox, options);
    let importedDocuments = 0;
    let duplicateDocuments = 0;
    let failedDocuments = 0;
    let skippedBeforeStartDate = 0;

    for (const messageId of syncBatch.messageIds) {
      try {
        const result = await this.ingestMessage(
          token,
          messageId,
          options,
          mailbox,
          syncBatch.syncMode === 'INCREMENTAL',
          syncBatch.labelId,
        );
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
      scannedMessages: syncBatch.messageIds.length,
      importedDocuments,
      duplicateDocuments,
      failedDocuments,
      skippedBeforeStartDate,
      syncMode: syncBatch.syncMode,
      nextHistoryId:
        failedDocuments === 0 ? syncBatch.candidateHistoryId : null,
    };
  }

  private async ingestMessage(
    accessToken: string,
    messageId: string,
    options: GmailIngestOptions,
    mailbox: string,
    requireIncrementalScopeMatch: boolean,
    billsLabelId: string | null,
  ): Promise<MessageIngestResult> {
    const message = await this.gmailJson<GmailMessage>(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    const normalizedMailbox = mailbox.toLowerCase();
    const recipientMatches = [
      'to',
      'cc',
      'bcc',
      'delivered-to',
      'x-original-to',
    ].some((headerName) =>
      (this.header(message.payload?.headers, headerName) ?? '')
        .toLowerCase()
        .includes(normalizedMailbox),
    );
    const hasBillsLabel = Boolean(
      billsLabelId && message.labelIds?.includes(billsLabelId),
    );
    const excludedBySystemLabel = message.labelIds?.some(
      (labelId) => labelId === 'TRASH' || labelId === 'SPAM',
    );
    const inBillsScope =
      !excludedBySystemLabel && (recipientMatches || hasBillsLabel);
    if (requireIncrementalScopeMatch && !inBillsScope) {
      return {
        imported: 0,
        duplicates: 0,
        failed: 0,
        skippedBeforeStartDate: 0,
      };
    }
    const subject = this.header(message.payload?.headers, 'subject');
    const senderEmail = extractMailboxAddress(
      this.header(message.payload?.headers, 'from'),
    );
    if (
      !this.receivedOnOrAfterStartDate(message, options) &&
      !this.isCloverCloseoutBoundaryEvidence(
        message,
        options,
        senderEmail,
        subject,
      )
    ) {
      return {
        imported: 0,
        duplicates: 0,
        failed: 0,
        skippedBeforeStartDate: 1,
      };
    }

    const trustDecision = isCloverCloseoutEmailEvidence(senderEmail, subject)
      ? AccountingInboxTrustDecision.TRUSTED
      : senderEmail
        ? await this.inbox.senderTrustDecision(senderEmail)
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
          part.partId ?? null,
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

  private async resolveSyncBatch(
    accessToken: string,
    mailbox: string,
    options: GmailIngestOptions,
  ): Promise<{
    messageIds: string[];
    candidateHistoryId: string | null;
    syncMode: GmailSyncMode;
    labelId: string | null;
  }> {
    const historyId = options.historyId?.trim() || null;
    if (historyId) {
      try {
        const incremental = await this.listHistoryMessageIds(
          accessToken,
          historyId,
        );
        return {
          messageIds: incremental.messageIds,
          candidateHistoryId: incremental.historyId,
          syncMode: 'INCREMENTAL',
          labelId: incremental.labelId,
        };
      } catch (error) {
        if (!(error instanceof GmailApiError) || error.status !== 404) {
          throw error;
        }
        this.logger.warn(
          `Gmail history cursor expired; falling back to bounded bootstrap | historyId=${historyId}`,
        );
      }
    }

    const profile = await this.gmailJson<GmailProfile>(
      accessToken,
      '/gmail/v1/users/me/profile',
    );
    const dateClause = this.gmailDateClause(options.accountingStartDate);
    const query = `{to:${mailbox} label:${GMAIL_BILLS_LABEL}} ${dateClause} -in:trash -in:spam`;
    const messageIds = await this.listMessageIds(accessToken, query);
    return {
      messageIds,
      candidateHistoryId: profile.historyId?.trim() || null,
      syncMode: 'BOOTSTRAP',
      labelId: null,
    };
  }

  private async listHistoryMessageIds(
    accessToken: string,
    startHistoryId: string,
  ): Promise<{
    messageIds: string[];
    historyId: string;
    labelId: string | null;
  }> {
    const labels = await this.gmailJson<GmailLabelList>(
      accessToken,
      '/gmail/v1/users/me/labels',
    );
    const labelId =
      labels.labels?.find((label) => label.name === GMAIL_BILLS_LABEL)?.id ??
      null;

    const messageIds = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId = startHistoryId;
    do {
      const params = new URLSearchParams({
        startHistoryId,
        maxResults: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.gmailJson<GmailHistoryList>(
        accessToken,
        `/gmail/v1/users/me/history?${params.toString()}`,
      );
      latestHistoryId = page.historyId?.trim() || latestHistoryId;
      for (const history of page.history ?? []) {
        for (const added of history.messagesAdded ?? []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
        for (const labeled of history.labelsAdded ?? []) {
          if (labeled.message?.id) messageIds.add(labeled.message.id);
        }
      }
      if (messageIds.size > MAX_GMAIL_SYNC_MESSAGES) {
        throw new Error(
          `Gmail incremental sync exceeds ${MAX_GMAIL_SYNC_MESSAGES} messages; cursor not advanced`,
        );
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return {
      messageIds: Array.from(messageIds),
      historyId: latestHistoryId,
      labelId,
    };
  }

  private gmailDateClause(accountingStartDate: string | null): string {
    if (!accountingStartDate) return 'newer_than:30d';
    const baseDate =
      accountingStartDate === PROVIDER_FINANCIAL_HISTORY_START_DATE
        ? CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE
        : accountingStartDate;
    const queryFloor = DateTime.fromISO(baseDate, {
      zone: 'utc',
    }).minus({ days: 1 });
    return `after:${queryFloor.toFormat('yyyy/MM/dd')}`;
  }

  private isCloverCloseoutBoundaryEvidence(
    message: GmailMessage,
    options: GmailIngestOptions,
    senderEmail: string | null,
    subject: string | null,
  ): boolean {
    if (
      !options.accountingStartDate ||
      !isCloverCloseoutEmailEvidence(senderEmail, subject) ||
      !message.internalDate
    ) {
      return false;
    }
    const millis = Number(message.internalDate);
    if (!Number.isFinite(millis)) return false;
    const receivedDate = DateTime.fromMillis(millis, {
      zone: options.timezone,
    }).startOf('day');
    const accountingStart = DateTime.fromISO(options.accountingStartDate, {
      zone: options.timezone,
    }).startOf('day');
    if (!receivedDate.isValid || !accountingStart.isValid) return false;
    const receivedDateKey = receivedDate.toISODate();
    return Boolean(
      receivedDateKey &&
      receivedDateKey >= CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE &&
      receivedDate.toMillis() < accountingStart.toMillis(),
    );
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
      if (result.length > MAX_GMAIL_SYNC_MESSAGES) {
        throw new Error(
          `Gmail bootstrap exceeds ${MAX_GMAIL_SYNC_MESSAGES} messages; history cursor not initialized`,
        );
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return result;
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
      throw new GmailApiError(
        response.status,
        `Gmail API ${response.status}: ${detail.slice(0, 500)}`,
      );
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
