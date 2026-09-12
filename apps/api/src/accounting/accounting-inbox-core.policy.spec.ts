import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import {
  AccountingInboxPolicyError,
  PROVIDER_FINANCIAL_HISTORY_START_DATE,
  hashAccountingJson,
  normalizeAccountingInboxArtifact,
  normalizeAccountingParseRun,
  normalizeAccountingTrustedSender,
  normalizeProviderFinancialDocument,
} from './accounting-inbox-core.policy';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('Accounting Inbox core policy', () => {
  it('pins the approved provider financial-history boundary', () => {
    expect(PROVIDER_FINANCIAL_HISTORY_START_DATE).toBe('2026-06-01');
  });

  it('normalizes EMAIL body evidence and requires an explicit trust decision', () => {
    expect(
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.EMAIL_BODY,
        transportIdentity: ' gmail:message-1:body ',
        contentHash: SHA_A.toUpperCase(),
        bodyText: ' Clover closeout ',
        senderEmail: ' Reports@Example.COM ',
        trustDecision: AccountingInboxTrustDecision.TRUSTED,
      }),
    ).toEqual(
      expect.objectContaining({
        transportIdentity: 'gmail:message-1:body',
        contentHash: SHA_A,
        bodyText: 'Clover closeout',
        senderEmail: 'reports@example.com',
      }),
    );

    expect(() =>
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.EMAIL_BODY,
        transportIdentity: 'gmail:message-2:body',
        contentHash: SHA_A,
        bodyText: 'closeout',
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    ).toThrow(AccountingInboxPolicyError);
  });

  it('requires file artifacts to have stored evidence and validates SHA-256 identity', () => {
    expect(() =>
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        kind: AccountingArtifactKind.PDF,
        transportIdentity: 'manual:1',
        contentHash: SHA_A,
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    ).toThrow('file artifact requires storedUrl');

    expect(() =>
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.PROVIDER_API,
        kind: AccountingArtifactKind.CSV,
        transportIdentity: 'provider:1',
        contentHash: 'not-a-sha',
        storedUrl: '/accounting/provider.csv',
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    ).toThrow('contentHash must be a SHA-256 hex digest');
  });

  it('normalizes trusted sender identity without assigning provider semantics', () => {
    expect(
      normalizeAccountingTrustedSender({
        email: ' Owner@Example.COM ',
        label: ' Owner upload ',
      }),
    ).toEqual({
      email: 'owner@example.com',
      label: 'Owner upload',
      isActive: true,
    });
  });

  it('requires parser success/error evidence and makes parser-version replay deterministic', () => {
    expect(() =>
      normalizeAccountingParseRun({
        artifactStableId: 'artifact_1',
        parserName: 'clover-closeout',
        parserVersion: 'v1',
        status: AccountingParseStatus.SUCCESS,
      }),
    ).toThrow('successful parse requires resultHash');

    expect(() =>
      normalizeAccountingParseRun({
        artifactStableId: 'artifact_1',
        parserName: 'clover-closeout',
        parserVersion: 'v1',
        status: AccountingParseStatus.ERROR,
      }),
    ).toThrow('failed parse requires errorMessage');

    expect(
      normalizeAccountingParseRun({
        artifactStableId: 'artifact_1',
        parserName: 'clover-closeout',
        parserVersion: 'v1',
        status: AccountingParseStatus.SUCCESS,
        resultHash: SHA_B,
      }).idempotencyKey,
    ).toBe('accounting-parse:artifact_1:clover-closeout:v1');
  });

  it('normalizes provider financial lines, permits signed components and rejects invalid periods', () => {
    const normalized = normalizeProviderFinancialDocument({
      artifactStableId: 'artifact_1',
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'clover:merchant:2026-06',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      parserName: 'clover-statement',
      parserVersion: 'v1',
      lines: [
        {
          component: AccountingFinancialComponent.PROCESSING_FEE,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -1250,
        },
      ],
    });
    expect(normalized.currency).toBe('CAD');
    expect(normalized.lines[0]).toEqual(
      expect.objectContaining({ lineNo: 1, amountCents: -1250 }),
    );

    expect(() =>
      normalizeProviderFinancialDocument({
        artifactStableId: 'artifact_1',
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        businessIdentityKey: 'clover:bad-period',
        periodStart: '2026-07-01',
        periodEnd: '2026-06-30',
        parserName: 'clover-statement',
        parserVersion: 'v1',
        lines: [
          {
            component: AccountingFinancialComponent.SALES,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 100,
          },
        ],
      }),
    ).toThrow('periodStart must be on or before periodEnd');
  });

  it('prevents control evidence from becoming postable financial facts', () => {
    expect(() =>
      normalizeProviderFinancialDocument({
        artifactStableId: 'artifact_1',
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
        businessIdentityKey: 'clover:batch:1',
        parserName: 'clover-closeout',
        parserVersion: 'v1',
        lines: [
          {
            component: AccountingFinancialComponent.SALES,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 100,
          },
        ],
      }),
    ).toThrow('BATCH_CONTROL lines cannot be POSTABLE');

    expect(() =>
      normalizeProviderFinancialDocument({
        artifactStableId: 'artifact_1',
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        businessIdentityKey: 'uber:statement:1',
        parserName: 'uber-statement',
        parserVersion: 'v1',
        lines: [
          {
            component: AccountingFinancialComponent.CONTROL_TOTAL,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 100,
          },
        ],
      }),
    ).toThrow('CONTROL_TOTAL lines cannot be POSTABLE');
  });

  it('hashes equivalent JSON objects deterministically regardless of key order', () => {
    expect(hashAccountingJson({ b: 2, a: { z: 3, y: 4 } })).toBe(
      hashAccountingJson({ a: { y: 4, z: 3 }, b: 2 }),
    );
  });
});
