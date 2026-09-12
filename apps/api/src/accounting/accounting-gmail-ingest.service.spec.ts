import {
  AccountingArtifactKind,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
} from '@prisma/client';
import { AccountingGmailIngestService } from './accounting-gmail-ingest.service';

const toBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const artifactResult = (
  artifactStableId: string,
  kind: AccountingArtifactKind,
) => ({
  artifactStableId,
  contentHash: 'a'.repeat(64),
  kind,
  inboxItem: {
    inboxItemStableId: `inbox_${artifactStableId}`,
    status: AccountingInboxStatus.PENDING_REVIEW,
  },
  duplicateOfArtifactStableId: null,
  replayed: false,
});

describe('AccountingGmailIngestService unified Inbox cutover', () => {
  const originalEnv = {
    clientId: process.env.ACCOUNTING_GMAIL_CLIENT_ID,
    clientSecret: process.env.ACCOUNTING_GMAIL_CLIENT_SECRET,
    refreshToken: process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN,
    address: process.env.ACCOUNTING_GMAIL_ADDRESS,
  };

  beforeEach(() => {
    process.env.ACCOUNTING_GMAIL_CLIENT_ID = 'client-id';
    process.env.ACCOUNTING_GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    process.env.ACCOUNTING_GMAIL_ADDRESS = 'bills@sanq.ca';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv.clientId === undefined)
      delete process.env.ACCOUNTING_GMAIL_CLIENT_ID;
    else process.env.ACCOUNTING_GMAIL_CLIENT_ID = originalEnv.clientId;
    if (originalEnv.clientSecret === undefined) {
      delete process.env.ACCOUNTING_GMAIL_CLIENT_SECRET;
    } else {
      process.env.ACCOUNTING_GMAIL_CLIENT_SECRET = originalEnv.clientSecret;
    }
    if (originalEnv.refreshToken === undefined) {
      delete process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN;
    } else {
      process.env.ACCOUNTING_GMAIL_REFRESH_TOKEN = originalEnv.refreshToken;
    }
    if (originalEnv.address === undefined)
      delete process.env.ACCOUNTING_GMAIL_ADDRESS;
    else process.env.ACCOUNTING_GMAIL_ADDRESS = originalEnv.address;
  });

  it('ingests body and supported attachment independently from the same message', async () => {
    const acquisition = {
      acquireEmailBody: jest
        .fn()
        .mockResolvedValue(
          artifactResult('acctart_body', AccountingArtifactKind.EMAIL_BODY),
        ),
      acquireEmailAttachment: jest
        .fn()
        .mockResolvedValue(
          artifactResult('acctart_pdf', AccountingArtifactKind.PDF),
        ),
    };
    const operations = {
      senderTrustDecision: jest
        .fn()
        .mockResolvedValue(AccountingInboxTrustDecision.TRUSTED),
    };
    const message = {
      id: 'message-1',
      internalDate: String(new Date('2026-09-12T12:00:00.000Z').getTime()),
      payload: {
        headers: [
          { name: 'From', value: 'Clover <reports@example.com>' },
          { name: 'Subject', value: 'Daily closeout' },
        ],
        parts: [
          {
            partId: 'body',
            mimeType: 'text/plain',
            filename: '',
            body: { data: toBase64Url('Batch ID 123\nTotal $12.34') },
          },
          {
            partId: 'attachment',
            mimeType: 'application/pdf',
            filename: 'statement.pdf',
            body: { attachmentId: 'attachment-1', size: 20 },
          },
        ],
      },
    };

    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === 'https://oauth2.googleapis.com/token') {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
          }),
        );
      }
      if (url.includes('/gmail/v1/users/me/messages?')) {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [{ id: 'message-1' }] }), {
            status: 200,
          }),
        );
      }
      if (url.includes('/messages/message-1?format=full')) {
        return Promise.resolve(
          new Response(JSON.stringify(message), { status: 200 }),
        );
      }
      if (url.includes('/messages/message-1/attachments/attachment-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: toBase64Url(Buffer.from('%PDF-1.4\n%%EOF')),
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const service = new AccountingGmailIngestService(
      acquisition as never,
      operations as never,
    );
    const result = await service.ingestBillsMailbox({
      accountingStartDate: null,
      timezone: 'America/Toronto',
    });

    expect(result).toEqual(
      expect.objectContaining({
        scannedMessages: 1,
        importedDocuments: 2,
        duplicateDocuments: 0,
        failedDocuments: 0,
      }),
    );
    expect(operations.senderTrustDecision).toHaveBeenCalledWith(
      'reports@example.com',
    );
    expect(acquisition.acquireEmailBody).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'message-1',
        senderEmail: 'reports@example.com',
        subject: 'Daily closeout',
      }),
      expect.stringContaining('Batch ID 123'),
      AccountingInboxTrustDecision.TRUSTED,
    );
    expect(acquisition.acquireEmailAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-1' }),
      'attachment-1',
      expect.objectContaining({
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
      }),
      AccountingInboxTrustDecision.TRUSTED,
    );
  });
});
