import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createId } from '@paralleldrive/cuid2';
import {
  AccountingDocumentSource,
  AccountingDocumentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getUploadsAccountingDir } from '../common/utils/uploads-path';
import { extractAccountingPdf } from './accounting-pdf-extractor';

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
  payload?: GmailPart;
};
type GmailAttachment = { data?: string; size?: number };
type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

@Injectable()
export class AccountingGmailIngestService {
  private readonly logger = new Logger(AccountingGmailIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.ACCOUNTING_GMAIL_CLIENT_ID?.trim() &&
        process.env.ACCOUNTING_GMAIL_CLIENT_SECRET?.trim() &&
        process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN?.trim(),
    );
  }

  async ingestBillsMailbox(): Promise<{
    configured: boolean;
    scannedMessages: number;
    importedDocuments: number;
    duplicateDocuments: number;
    failedDocuments: number;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        scannedMessages: 0,
        importedDocuments: 0,
        duplicateDocuments: 0,
        failedDocuments: 0,
      };
    }

    const token = await this.getAccessToken();
    const mailbox = process.env.ACCOUNTING_GMAIL_ADDRESS?.trim() || 'bills@sanq.ca';
    const query = `to:${mailbox} has:attachment filename:pdf newer_than:30d -in:trash -in:spam`;
    const messageIds = await this.listMessageIds(token, query);
    let importedDocuments = 0;
    let duplicateDocuments = 0;
    let failedDocuments = 0;

    for (const messageId of messageIds) {
      try {
        const result = await this.ingestMessage(token, messageId);
        importedDocuments += result.imported;
        duplicateDocuments += result.duplicates;
        failedDocuments += result.failed;
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
    };
  }

  private async ingestMessage(accessToken: string, messageId: string) {
    const message = await this.gmailJson<GmailMessage>(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    const subject = this.header(message.payload?.headers, 'subject');
    const pdfParts = this.flattenParts(message.payload).filter((part) => {
      const filename = part.filename?.trim() ?? '';
      return (
        part.body?.attachmentId &&
        (part.mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf'))
      );
    });
    let imported = 0;
    let duplicates = 0;
    let failed = 0;

    for (const part of pdfParts) {
      const attachmentId = part.body?.attachmentId;
      if (!attachmentId) continue;
      const existingAttachment = await this.prisma.accountingExpenseDocument.findFirst({
        where: { gmailMessageId: messageId, gmailAttachmentId: attachmentId },
        select: { documentStableId: true },
      });
      if (existingAttachment) {
        duplicates += 1;
        continue;
      }

      try {
        const attachment = await this.gmailJson<GmailAttachment>(
          accessToken,
          `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        );
        if (!attachment.data) {
          failed += 1;
          continue;
        }
        const buffer = this.decodeBase64Url(attachment.data);
        if (
          buffer.length < 5 ||
          buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
        ) {
          failed += 1;
          continue;
        }
        const fileHash = createHash('sha256').update(buffer).digest('hex');
        const duplicateHash = await this.prisma.accountingExpenseDocument.findUnique({
          where: { fileHash },
          select: { documentStableId: true },
        });
        if (duplicateHash) {
          duplicates += 1;
          continue;
        }

        const { text, extraction } = extractAccountingPdf(buffer);
        const attachmentUrl = await this.savePdf(buffer, part.filename);
        await this.prisma.accountingExpenseDocument.create({
          data: {
            documentStableId: `expense_${createId()}`,
            source: AccountingDocumentSource.GMAIL,
            status: AccountingDocumentStatus.PENDING_REVIEW,
            occurredAt: extraction.date ? new Date(`${extraction.date}T12:00:00Z`) : null,
            subtotalCents: extraction.subtotalCents,
            taxCents: extraction.taxCents,
            totalCents: extraction.totalCents,
            currency: 'CAD',
            gmailMessageId: messageId,
            gmailAttachmentId: attachmentId,
            fileHash,
            emailSubject: subject,
            attachmentUrls: [attachmentUrl],
            extractedText: text.slice(0, 100_000),
            extractionJson: extraction as unknown as Prisma.InputJsonValue,
          },
        });
        imported += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to ingest Gmail attachment ${messageId}/${attachmentId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { imported, duplicates, failed };
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
    const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
    if (!response.ok || !payload?.access_token) {
      throw new Error(
        `Gmail OAuth refresh failed (${response.status}): ${payload?.error_description ?? payload?.error ?? 'unknown error'}`,
      );
    }
    return payload.access_token;
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

  private async gmailJson<T>(accessToken: string, pathName: string): Promise<T> {
    const response = await this.fetchWithTimeout(`https://gmail.googleapis.com${pathName}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Gmail API ${response.status}: ${detail.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  private async savePdf(buffer: Buffer, originalName?: string) {
    const dir = path.join(getUploadsAccountingDir(), 'bills');
    await fs.promises.mkdir(dir, { recursive: true });
    const safeBase = path
      .basename(originalName?.trim() || 'bill.pdf', '.pdf')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 48);
    const fileName = `${Date.now()}-${createId()}-${safeBase || 'bill'}.pdf`;
    await fs.promises.writeFile(path.join(dir, fileName), buffer, { flag: 'wx' });
    return `/api/v1/accounting/files/bills/${fileName}`;
  }

  private flattenParts(part?: GmailPart): GmailPart[] {
    if (!part) return [];
    return [part, ...(part.parts ?? []).flatMap((child) => this.flattenParts(child))];
  }

  private header(headers: GmailHeader[] | undefined, name: string) {
    return (
      headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ??
      null
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
