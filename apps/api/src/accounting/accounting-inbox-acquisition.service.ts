import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import { getUploadsAccountingDir } from '../common/utils/uploads-path';
import {
  extractAccountingPdf,
  extractAccountingText,
} from './accounting-pdf-extractor';
import {
  classifyAccountingDocumentText,
  type AccountingReviewMetadata,
} from './accounting-document-review';
import { extractAccountingImageText } from './accounting-image-ocr';
import {
  ACCOUNTING_RECEIPT_IMAGE_POLICY,
  detectAccountingReceiptImageType,
  processAccountingReceiptImage,
} from './accounting-receipt-image';
import { AccountingOperationsService } from './accounting-operations.service';
import {
  AccountingProviderFinancialProcessingError,
  AccountingProviderFinancialService,
} from './accounting-provider-financial.service';

export const ACCOUNTING_INBOX_FILE_MAX_BYTES = 25 * 1024 * 1024;
const GENERIC_PARSER_NAME = 'accounting-generic-document-review';
const GENERIC_PARSER_VERSION = '1';

type AccountingInboxFile = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
};

type EmailEvidenceContext = {
  messageId: string;
  senderEmail: string | null;
  subject: string | null;
  receivedAt: string | null;
};

type FileAcquisitionInput = {
  acquisitionMode: AccountingArtifactAcquisitionMode;
  transportIdentity: string;
  file: AccountingInboxFile;
  trustDecision: AccountingInboxTrustDecision;
  senderEmail?: string | null;
  emailSubject?: string | null;
  metadataJson?: Record<string, unknown>;
  providerFinancialHint?: {
    providerHint?: AccountingFinancialProvider | null;
    reportTypeHint?: string | null;
    periodStartHint?: string | null;
    periodEndHint?: string | null;
    providerDocumentRefHint?: string | null;
  };
};

type TextReviewExtraction = ReturnType<typeof extractAccountingText> &
  AccountingReviewMetadata & {
    extractedText: string;
  };

type ImageReviewExtraction = TextReviewExtraction & {
  ocrEngine: 'TESSERACT';
  ocrStatus: 'SUCCESS' | 'ERROR';
};

@Injectable()
export class AccountingInboxAcquisitionService {
  private readonly logger = new Logger(AccountingInboxAcquisitionService.name);

  constructor(
    private readonly operations: AccountingOperationsService,
    private readonly providerFinancial: AccountingProviderFinancialService,
  ) {}

  async acquireManualFile(file: AccountingInboxFile) {
    return this.acquireFile({
      acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
      transportIdentity: `manual:${createId()}`,
      file,
      trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      metadataJson: { acquisition: 'MANUAL_UPLOAD' },
    });
  }

  async acquireProviderApiCsv(input: {
    transportIdentity: string;
    fileName: string;
    content: string;
    provider: AccountingFinancialProvider;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    providerDocumentRef: string;
    metadataJson?: Record<string, unknown>;
  }) {
    return this.acquireFile({
      acquisitionMode: AccountingArtifactAcquisitionMode.PROVIDER_API,
      transportIdentity: input.transportIdentity,
      file: {
        originalname: input.fileName,
        mimetype: 'text/csv',
        buffer: Buffer.from(input.content, 'utf8'),
      },
      trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      metadataJson: {
        acquisition: 'PROVIDER_API',
        provider: input.provider,
        reportType: input.reportType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        providerDocumentRef: input.providerDocumentRef,
        ...(input.metadataJson ?? {}),
      },
      providerFinancialHint: {
        providerHint: input.provider,
        reportTypeHint: input.reportType,
        periodStartHint: input.periodStart,
        periodEndHint: input.periodEnd,
        providerDocumentRefHint: input.providerDocumentRef,
      },
    });
  }

  async acquireEmailBody(
    context: EmailEvidenceContext,
    text: string,
    trustDecision: AccountingInboxTrustDecision,
  ) {
    const normalizedText = normalizeBodyText(text);
    if (!normalizedText) return null;
    const contentHash = sha256(Buffer.from(normalizedText, 'utf8'));
    const artifact = await this.operations.registerInboxArtifact({
      acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
      kind: AccountingArtifactKind.EMAIL_BODY,
      transportIdentity: `gmail:${context.messageId}:body`,
      contentHash,
      mimeType: 'text/plain; charset=utf-8',
      byteSize: Buffer.byteLength(normalizedText, 'utf8'),
      bodyText: normalizedText,
      senderEmail: context.senderEmail,
      emailSubject: context.subject,
      metadataJson: {
        gmailMessageId: context.messageId,
        gmailAttachmentId: null,
        receivedAt: context.receivedAt,
      },
      trustDecision,
    });
    try {
      await this.parseTextIfEligible(artifact, normalizedText, 'EMAIL_BODY', {
        emailSubject: context.subject,
      });
    } catch (error) {
      if (!(error instanceof AccountingProviderFinancialProcessingError)) {
        await this.recordParseFailureIfEligible(artifact, error);
      }
    }
    return artifact;
  }

  async acquireEmailAttachment(
    context: EmailEvidenceContext,
    attachmentId: string,
    file: AccountingInboxFile,
    trustDecision: AccountingInboxTrustDecision,
  ) {
    return this.acquireFile({
      acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
      transportIdentity: `gmail:${context.messageId}:attachment:${attachmentId}`,
      file,
      trustDecision,
      senderEmail: context.senderEmail,
      emailSubject: context.subject,
      metadataJson: {
        gmailMessageId: context.messageId,
        gmailAttachmentId: attachmentId,
        receivedAt: context.receivedAt,
      },
    });
  }

  private async acquireFile(input: FileAcquisitionInput) {
    if (!input.file.buffer.length) {
      throw new BadRequestException('Accounting inbox file is empty');
    }
    if (input.file.buffer.length > ACCOUNTING_INBOX_FILE_MAX_BYTES) {
      throw new BadRequestException('Accounting inbox file exceeds 25 MB');
    }

    const detected = this.detectFile(input.file);
    if (
      detected.kind === AccountingArtifactKind.IMAGE &&
      input.file.buffer.length > ACCOUNTING_RECEIPT_IMAGE_POLICY.maxUploadBytes
    ) {
      throw new BadRequestException('Accounting image exceeds 20 MB');
    }

    const storedUrl = await this.storeRawFile(
      input.file.buffer,
      input.file.originalname,
      detected.extension,
    );
    let artifact: Awaited<
      ReturnType<AccountingOperationsService['registerInboxArtifact']>
    >;
    try {
      artifact = await this.operations.registerInboxArtifact({
        acquisitionMode: input.acquisitionMode,
        kind: detected.kind,
        transportIdentity: input.transportIdentity,
        contentHash: sha256(input.file.buffer),
        mimeType: detected.mimeType,
        originalFilename: path.basename(
          input.file.originalname || `evidence${detected.extension}`,
        ),
        byteSize: input.file.buffer.length,
        storedUrl,
        senderEmail: input.senderEmail,
        emailSubject: input.emailSubject,
        metadataJson: input.metadataJson,
        trustDecision: input.trustDecision,
      });
    } catch (error) {
      await this.removeStoredFile(storedUrl);
      throw error;
    }

    if (artifact.replayed) {
      await this.removeStoredFile(storedUrl);
    }
    let providerFinancialMatched = false;
    try {
      providerFinancialMatched = await this.parseFileIfEligible(
        artifact,
        detected.kind,
        input.file.buffer,
        {
          originalFilename: input.file.originalname,
          emailSubject: input.emailSubject,
          ...(input.providerFinancialHint ?? {}),
        },
      );
    } catch (error) {
      if (!(error instanceof AccountingProviderFinancialProcessingError)) {
        await this.recordParseFailureIfEligible(artifact, error);
      }
    }
    return {
      ...artifact,
      storedUrl: artifact.replayed ? artifact.storedUrl : storedUrl,
      providerFinancialMatched,
    };
  }

  private async parseFileIfEligible(
    artifact: Awaited<
      ReturnType<AccountingOperationsService['registerInboxArtifact']>
    >,
    kind: AccountingArtifactKind,
    buffer: Buffer,
    providerContext: {
      originalFilename?: string | null;
      emailSubject?: string | null;
      providerHint?: AccountingFinancialProvider | null;
      reportTypeHint?: string | null;
      periodStartHint?: string | null;
      periodEndHint?: string | null;
      providerDocumentRefHint?: string | null;
    },
  ): Promise<boolean> {
    if (artifact.inboxItem?.status !== AccountingInboxStatus.PENDING_REVIEW) {
      return false;
    }
    if (kind === AccountingArtifactKind.CSV) {
      const text = buffer.toString('utf8');
      const provider = await this.providerFinancial.parseAndMaterialize({
        artifactStableId: artifact.artifactStableId,
        text,
        ...providerContext,
      });
      if (provider.matched) return true;
      if (
        providerContext.providerHint ===
          AccountingFinancialProvider.UBER_EATS &&
        providerContext.reportTypeHint
      ) {
        await this.providerFinancial.recordUnsupportedUberApiParse({
          artifactStableId: artifact.artifactStableId,
          reportType: providerContext.reportTypeHint,
        });
        return false;
      }
      await this.operations.recordInboxParseRun({
        artifactStableId: artifact.artifactStableId,
        parserName: GENERIC_PARSER_NAME,
        parserVersion: GENERIC_PARSER_VERSION,
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          inputKind: 'CSV',
          providerParserPending: true,
        },
      });
      return false;
    }
    if (kind === AccountingArtifactKind.PDF) {
      const { text, extraction } = extractAccountingPdf(buffer);
      const provider = await this.providerFinancial.parseAndMaterialize({
        artifactStableId: artifact.artifactStableId,
        text,
        ...providerContext,
      });
      if (provider.matched) return true;
      const result: TextReviewExtraction = {
        ...extraction,
        inputKind: 'PDF',
        ...classifyAccountingDocumentText(text, extraction),
        extractedText: text.slice(0, 100_000),
      };
      await this.recordSuccessfulParse(artifact.artifactStableId, result);
      return false;
    }
    if (kind === AccountingArtifactKind.IMAGE) {
      let text = '';
      let ocrStatus: ImageReviewExtraction['ocrStatus'] = 'SUCCESS';
      try {
        const detected = detectAccountingReceiptImageType(buffer);
        if (!detected) throw new Error('unsupported image');
        const processed = await processAccountingReceiptImage({
          originalname: `evidence.${detected === 'jpeg' ? 'jpg' : detected}`,
          buffer,
        });
        text = (await extractAccountingImageText(processed.buffer)).text;
      } catch (error) {
        ocrStatus = 'ERROR';
        this.logger.warn(
          `Accounting Inbox image OCR failed for ${artifact.artifactStableId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      const extraction = extractAccountingText(text);
      const review =
        ocrStatus === 'SUCCESS'
          ? classifyAccountingDocumentText(text, extraction)
          : {
              reviewDisposition: 'UNRECOGNIZED' as const,
              reviewReason: 'NO_READABLE_TEXT' as const,
            };
      const result: ImageReviewExtraction = {
        ...extraction,
        inputKind: 'IMAGE',
        ...review,
        extractedText: text.slice(0, 100_000),
        ocrEngine: 'TESSERACT',
        ocrStatus,
      };
      await this.recordSuccessfulParse(artifact.artifactStableId, result);
      return false;
    }
    return false;
  }

  private async parseTextIfEligible(
    artifact: Awaited<
      ReturnType<AccountingOperationsService['registerInboxArtifact']>
    >,
    text: string,
    inputKind: 'EMAIL_BODY',
    providerContext: {
      emailSubject?: string | null;
    },
  ) {
    if (artifact.inboxItem?.status !== AccountingInboxStatus.PENDING_REVIEW) {
      return;
    }
    const provider = await this.providerFinancial.parseAndMaterialize({
      artifactStableId: artifact.artifactStableId,
      text,
      ...providerContext,
    });
    if (provider.matched) return;
    const extraction = extractAccountingText(text);
    const result: TextReviewExtraction = {
      ...extraction,
      inputKind,
      ...classifyAccountingDocumentText(text, extraction),
      extractedText: text.slice(0, 100_000),
    };
    await this.recordSuccessfulParse(artifact.artifactStableId, result);
  }

  private async recordSuccessfulParse(
    artifactStableId: string,
    result: TextReviewExtraction | ImageReviewExtraction,
  ) {
    await this.operations.recordInboxParseRun({
      artifactStableId,
      parserName: GENERIC_PARSER_NAME,
      parserVersion: GENERIC_PARSER_VERSION,
      status: AccountingParseStatus.SUCCESS,
      resultHash: sha256(Buffer.from(JSON.stringify(result), 'utf8')),
      resultJson: result,
    });
  }

  private async recordParseFailureIfEligible(
    artifact: Awaited<
      ReturnType<AccountingOperationsService['registerInboxArtifact']>
    >,
    error: unknown,
  ) {
    if (artifact.inboxItem?.status !== AccountingInboxStatus.PENDING_REVIEW) {
      return;
    }
    const message =
      error instanceof Error ? error.message : 'Unknown accounting parse error';
    this.logger.warn(
      `Accounting Inbox parse failed for ${artifact.artifactStableId}: ${message}`,
    );
    await this.operations.recordInboxParseRun({
      artifactStableId: artifact.artifactStableId,
      parserName: GENERIC_PARSER_NAME,
      parserVersion: GENERIC_PARSER_VERSION,
      status: AccountingParseStatus.ERROR,
      errorMessage: message.slice(0, 1000),
    });
  }

  private detectFile(file: AccountingInboxFile): {
    kind: AccountingArtifactKind;
    extension: string;
    mimeType: string;
  } {
    if (
      file.buffer.length >= 5 &&
      file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    ) {
      return {
        kind: AccountingArtifactKind.PDF,
        extension: '.pdf',
        mimeType: 'application/pdf',
      };
    }
    const imageType = detectAccountingReceiptImageType(file.buffer);
    if (imageType) {
      return {
        kind: AccountingArtifactKind.IMAGE,
        extension: imageType === 'jpeg' ? '.jpg' : `.${imageType}`,
        mimeType: imageType === 'jpeg' ? 'image/jpeg' : `image/${imageType}`,
      };
    }
    const extension = path.extname(file.originalname ?? '').toLowerCase();
    const declaredMime = file.mimetype?.split(';')[0]?.trim().toLowerCase();
    if (
      extension === '.csv' ||
      declaredMime === 'text/csv' ||
      declaredMime === 'application/csv'
    ) {
      if (file.buffer.includes(0)) {
        throw new BadRequestException('CSV file contains invalid binary data');
      }
      return {
        kind: AccountingArtifactKind.CSV,
        extension: '.csv',
        mimeType: 'text/csv; charset=utf-8',
      };
    }
    throw new BadRequestException(
      'Unsupported accounting evidence file; use PDF, CSV, JPEG, PNG, or WebP',
    );
  }

  private async storeRawFile(
    buffer: Buffer,
    originalName: string,
    extension: string,
  ) {
    const dir = path.join(getUploadsAccountingDir(), 'inbox');
    await fs.promises.mkdir(dir, { recursive: true });
    const originalBase = path.basename(
      originalName || 'evidence',
      path.extname(originalName || ''),
    );
    const safeBase = originalBase
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const fileName = `${Date.now()}-${createId()}-${safeBase || 'evidence'}${extension}`;
    await fs.promises.writeFile(path.join(dir, fileName), buffer, {
      flag: 'wx',
    });
    return `/api/v1/accounting/files/inbox/${fileName}`;
  }

  private async removeStoredFile(storedUrl: string) {
    const prefix = '/api/v1/accounting/files/inbox/';
    if (!storedUrl.startsWith(prefix)) return;
    const fileName = path.basename(storedUrl.slice(prefix.length));
    try {
      await fs.promises.rm(
        path.join(getUploadsAccountingDir(), 'inbox', fileName),
        {
          force: true,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to remove orphaned Accounting Inbox file ${fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export function extractMailboxAddress(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const bracketed = /<([^<>\s@]+@[^<>\s@]+)>/.exec(value)?.[1];
  const candidate = (bracketed ?? value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function normalizeBodyText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
