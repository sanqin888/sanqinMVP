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
      if (url.endsWith('/gmail/v1/users/me/profile')) {
        return Promise.resolve(
          new Response(JSON.stringify({ historyId: 'history-bootstrap-1' }), {
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
        syncMode: 'BOOTSTRAP',
        nextHistoryId: 'history-bootstrap-1',
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
      'attachment',
    );
  });

  it('retains the bounded pre-start Clover Closeout window and trusts only the exact provider Closeout shape', async () => {
    const acquisition = {
      acquireEmailBody: jest
        .fn()
        .mockResolvedValue(
          artifactResult('acctart_closeout', AccountingArtifactKind.EMAIL_BODY),
        ),
      acquireEmailAttachment: jest.fn(),
    };
    const operations = {
      senderTrustDecision: jest
        .fn()
        .mockResolvedValue(AccountingInboxTrustDecision.UNTRUSTED),
    };
    const message = {
      id: 'message-closeout',
      internalDate: String(new Date('2026-05-30T12:00:00.000Z').getTime()),
      payload: {
        headers: [
          { name: 'From', value: 'Clover <app@clover.com>' },
          {
            name: 'Subject',
            value: 'MID 29351880018 Closeout Report for May 29, 2026',
          },
        ],
        parts: [
          {
            partId: 'body',
            mimeType: 'text/plain',
            filename: '',
            body: {
              data: toBase64Url(
                'Batch ID: 097NYJ27P2HZM\nBatch Totals\nSales 5 $57.21',
              ),
            },
          },
        ],
      },
    };
    let listUrl = '';

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
      if (url.endsWith('/gmail/v1/users/me/profile')) {
        return Promise.resolve(
          new Response(JSON.stringify({ historyId: 'history-bootstrap-1' }), {
            status: 200,
          }),
        );
      }
      if (url.includes('/gmail/v1/users/me/messages?')) {
        listUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({ messages: [{ id: 'message-closeout' }] }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/messages/message-closeout?format=full')) {
        return Promise.resolve(
          new Response(JSON.stringify(message), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const service = new AccountingGmailIngestService(
      acquisition as never,
      operations as never,
    );
    const result = await service.ingestBillsMailbox({
      accountingStartDate: '2026-06-01',
      timezone: 'America/Toronto',
    });

    expect(decodeURIComponent(listUrl)).toContain('after:2026/05/28');
    expect(result).toEqual(
      expect.objectContaining({
        scannedMessages: 1,
        importedDocuments: 1,
        skippedBeforeStartDate: 0,
        syncMode: 'BOOTSTRAP',
        nextHistoryId: 'history-bootstrap-1',
      }),
    );
    expect(operations.senderTrustDecision).not.toHaveBeenCalled();
    expect(acquisition.acquireEmailBody).toHaveBeenCalledWith(
      expect.objectContaining({
        senderEmail: 'app@clover.com',
        subject: 'MID 29351880018 Closeout Report for May 29, 2026',
      }),
      expect.stringContaining('097NYJ27P2HZM'),
      AccountingInboxTrustDecision.TRUSTED,
    );
  });

  it('uses Gmail historyId for incremental sync and advances only to the returned history watermark', async () => {
    const acquisition = {
      acquireEmailBody: jest
        .fn()
        .mockResolvedValue(
          artifactResult(
            'acctart_incremental',
            AccountingArtifactKind.EMAIL_BODY,
          ),
        ),
      acquireEmailAttachment: jest.fn(),
    };
    const operations = {
      senderTrustDecision: jest
        .fn()
        .mockResolvedValue(AccountingInboxTrustDecision.TRUSTED),
    };
    const message = {
      id: 'message-incremental',
      internalDate: String(new Date('2026-09-29T15:00:00.000Z').getTime()),
      payload: {
        headers: [
          { name: 'To', value: 'SanQ Bills <bills@sanq.ca>' },
          { name: 'From', value: 'Vendor <vendor@example.com>' },
          { name: 'Subject', value: 'New invoice' },
        ],
        parts: [
          {
            partId: 'body',
            mimeType: 'text/plain',
            filename: '',
            body: { data: toBase64Url('Invoice total $12.34') },
          },
        ],
      },
    };
    const labeledMessage = {
      ...message,
      id: 'message-labeled',
      labelIds: ['Label_123'],
      payload: {
        ...message.payload,
        headers: [
          { name: 'To', value: 'owner@example.com' },
          { name: 'From', value: 'Vendor <vendor@example.com>' },
          { name: 'Subject', value: 'Labeled invoice' },
        ],
      },
    };
    let historyUrl = '';

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
      if (url.endsWith('/gmail/v1/users/me/labels')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              labels: [{ id: 'Label_123', name: 'SanQ-Bills' }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/gmail/v1/users/me/history?')) {
        historyUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              history: [
                {
                  messagesAdded: [
                    { message: { id: 'message-incremental' } },
                    { message: { id: 'message-labeled' } },
                  ],
                },
              ],
              historyId: 'history-101',
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/messages/message-incremental?format=full')) {
        return Promise.resolve(
          new Response(JSON.stringify(message), { status: 200 }),
        );
      }
      if (url.includes('/messages/message-labeled?format=full')) {
        return Promise.resolve(
          new Response(JSON.stringify(labeledMessage), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const service = new AccountingGmailIngestService(
      acquisition as never,
      operations as never,
    );
    const result = await service.ingestBillsMailbox({
      accountingStartDate: '2026-06-01',
      timezone: 'America/Toronto',
      historyId: 'history-100',
    });

    expect(decodeURIComponent(historyUrl)).toContain(
      'startHistoryId=history-100',
    );
    expect(decodeURIComponent(historyUrl)).not.toContain('labelId=');
    expect(result).toEqual(
      expect.objectContaining({
        syncMode: 'INCREMENTAL',
        scannedMessages: 2,
        importedDocuments: 2,
        failedDocuments: 0,
        nextHistoryId: 'history-101',
      }),
    );
  });

  it('falls back to bounded bootstrap when Gmail rejects an expired history cursor', async () => {
    const acquisition = {
      acquireEmailBody: jest.fn(),
      acquireEmailAttachment: jest.fn(),
    };
    const operations = {
      senderTrustDecision: jest.fn(),
    };
    let bootstrapListCalled = false;

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
      if (url.endsWith('/gmail/v1/users/me/labels')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              labels: [{ id: 'Label_123', name: 'SanQ-Bills' }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/gmail/v1/users/me/history?')) {
        return Promise.resolve(
          new Response('expired historyId', { status: 404 }),
        );
      }
      if (url.endsWith('/gmail/v1/users/me/profile')) {
        return Promise.resolve(
          new Response(JSON.stringify({ historyId: 'history-reset' }), {
            status: 200,
          }),
        );
      }
      if (url.includes('/gmail/v1/users/me/messages?')) {
        bootstrapListCalled = true;
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const service = new AccountingGmailIngestService(
      acquisition as never,
      operations as never,
    );
    const result = await service.ingestBillsMailbox({
      accountingStartDate: '2026-06-01',
      timezone: 'America/Toronto',
      historyId: 'history-expired',
    });

    expect(bootstrapListCalled).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        syncMode: 'BOOTSTRAP',
        scannedMessages: 0,
        failedDocuments: 0,
        nextHistoryId: 'history-reset',
      }),
    );
  });
});
