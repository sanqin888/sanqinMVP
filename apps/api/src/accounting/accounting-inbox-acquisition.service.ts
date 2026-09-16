import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import { getAccountingUploadsDir } from './accounting-storage-path';
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
} from './accounting-receipt-image';
import { AccountingOperationsService } from './accounting-operations.service';
import {
  AccountingProviderFinancialProcessingError,
  AccountingProviderFinancialService,
  type AccountingProviderFinancialParseContext,
} from './accounting-provider-financial.service';
import {
  ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_NAME,
  ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_VERSION,
  parseAccountingStructuredExpenseCsv,
} from './accounting-structured-expense-csv';
import { normalizeAccountingManualUploadFilename } from './accounting-upload-filename';

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
    providerRecognitionAmbiguousRuleStableIds?: string[];
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
      file: {
        ...file,
        originalname: normalizeAccountingManualUploadFilename(file.originalname),
      },
      trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      metadataJson: { acquisition: 'MANUAL_UPLOAD' },
    });
  }

  async permanentlyDeleteManualUpload(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    const deleted =
      await this.operations.permanentlyDeleteManualUpload(inboxItemStableId);
    const storageCleanupFailures: string[] = [];
    for (const storedUrl of deleted.storedUrls) {
      if (!(await this.removeStoredFile(storedUrl))) {
        storageCleanupFailures.push(storedUrl);
      }
    }
    this.logger.log(
      `Accounting manual upload permanently deleted | inboxItem=${inboxItemStableId} | operator=${operatorUserStableId} | artifacts=${deleted.deletedArtifactStableIds.length} | duplicateRecords=${deleted.removedDuplicateCount} | storageCleanupFailures=${storageCleanupFailures.length}`,
    );
    return {
      inboxItemStableId,
      deleted: true,
      deletedArtifactStableIds: deleted.deletedArtifactStableIds,
      removedDuplicateCount: deleted.removedDuplicateCount,
      storageCleanupComplete: storageCleanupFailures.length === 0,
    };
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

    let effectiveStoredUrl = artifact.replayed ? artifact.storedUrl : storedUrl;
    let duplicateStorageCleanupComplete: boolean | null = null;
    if (artifact.replayed) {
      await this.removeStoredFile(storedUrl);
    } else if (
      input.acquisitionMode ===
        AccountingArtifactAcquisitionMode.MANUAL_UPLOAD &&
      artifact.inboxItem?.status === AccountingInboxStatus.DUPLICATE
    ) {
      duplicateStorageCleanupComplete = await this.removeStoredFile(storedUrl);
      effectiveStoredUrl = null;
    }
    let providerFinancialMatched = false;
    try {
      providerFinancialMatched = await this.parseFileIfEligible(
        artifact,
        input.acquisitionMode,
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
      storedUrl: effectiveStoredUrl,
      providerFinancialMatched,
      duplicateStorageCleanupComplete,
    };
  }

  private async parseFileIfEligible(
    artifact: Awaited<
      ReturnType<AccountingOperationsService['registerInboxArtifact']>
    >,
    acquisitionMode: AccountingArtifactAcquisitionMode,
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
      const provider = await this.parseProviderEvidence(acquisitionMode, {
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

      const ambiguousRuleStableIds =
        'ambiguousRuleStableIds' in provider
          ? provider.ambiguousRuleStableIds
          : [];
      if (ambiguousRuleStableIds.length) {
        await this.operations.recordInboxParseRun({
          artifactStableId: artifact.artifactStableId,
          parserName: GENERIC_PARSER_NAME,
          parserVersion: GENERIC_PARSER_VERSION,
          status: AccountingParseStatus.SUCCESS,
          resultJson: {
            inputKind: 'CSV',
            providerRecognitionAmbiguousRuleStableIds: ambiguousRuleStableIds,
            extractedText: text.slice(0, 100_000),
          },
        });
        return false;
      }

      if (acquisitionMode === AccountingArtifactAcquisitionMode.PROVIDER_API) {
        await this.operations.recordInboxParseRun({
          artifactStableId: artifact.artifactStableId,
          parserName: GENERIC_PARSER_NAME,
          parserVersion: GENERIC_PARSER_VERSION,
          status: AccountingParseStatus.SKIPPED,
          resultJson: {
            inputKind: 'CSV',
            providerParserPending: true,
            extractedText: text.slice(0, 100_000),
          },
        });
        return false;
      }

      const structuredExpense = parseAccountingStructuredExpenseCsv(text);
      if (structuredExpense.matched) {
        const requiresBatchExpenseImport =
          structuredExpense.rows.length !== 1 ||
          structuredExpense.invalidRows.length > 0;
        const previewRows = structuredExpense.rows.slice(0, 100);
        const contextExtraction = extractAccountingText(
          [
            providerContext.originalFilename?.replace(/[^a-z0-9]+/gi, ' '),
            ...previewRows.flatMap((row) => [
              row.counterparty,
              row.description,
            ]),
          ]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(' '),
        );
        const singleRow = !requiresBatchExpenseImport
          ? structuredExpense.rows[0]
          : null;
        const result = {
          inputKind: 'CSV' as const,
          structuredExpenseCsv: true,
          structuredExpenseRowCount: structuredExpense.rows.length,
          structuredExpenseInvalidRowCount:
            structuredExpense.invalidRows.length,
          structuredExpenseRows: previewRows,
          structuredExpenseRowsTruncated:
            structuredExpense.rows.length > previewRows.length,
          requiresBatchExpenseImport,
          extractedText: text.slice(0, 100_000),
          ...(singleRow
            ? {
                date: singleRow.occurredAt,
                subtotalCents: singleRow.totalCents,
                taxCents: null,
                totalCents: singleRow.totalCents,
                suggestedCategoryStableId:
                  contextExtraction.suggestedCategoryStableId,
                suggestedCategoryName: contextExtraction.suggestedCategoryName,
                confidence: 'HIGH' as const,
                requiresSplit: false,
                reviewDisposition: 'LIKELY_BILL' as const,
                reviewReason: 'STRUCTURED_EXPENSE_ROW',
              }
            : {
                reviewDisposition: 'LIKELY_BILL' as const,
                reviewReason: 'STRUCTURED_EXPENSE_BATCH',
              }),
        };
        await this.operations.recordInboxParseRun({
          artifactStableId: artifact.artifactStableId,
          parserName: ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_NAME,
          parserVersion: ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_VERSION,
          status: AccountingParseStatus.SUCCESS,
          resultJson: result,
        });
        if (singleRow) {
          await this.operations.suggestUnifiedInboxClassification(
            artifact.artifactStableId,
            {
              classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
              selectedProvider: null,
            },
          );
        }
        return false;
      }

      await this.operations.recordInboxParseRun({
        artifactStableId: artifact.artifactStableId,
        parserName: GENERIC_PARSER_NAME,
        parserVersion: GENERIC_PARSER_VERSION,
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          inputKind: 'CSV',
          csvStructureUnrecognized: true,
          extractedText: text.slice(0, 100_000),
        },
      });
      return false;
    }
    if (kind === AccountingArtifactKind.PDF) {
      const { text, extraction } = await extractAccountingPdf(buffer);
      const provider = await this.parseProviderEvidence(acquisitionMode, {
        artifactStableId: artifact.artifactStableId,
        text,
        ...providerContext,
      });
      if (provider.matched) return true;
      const ambiguousRuleStableIds =
        'ambiguousRuleStableIds' in provider
          ? provider.ambiguousRuleStableIds
          : [];
      const result: TextReviewExtraction = {
        ...extraction,
        inputKind: 'PDF',
        ...classifyAccountingDocumentText(text, extraction),
        extractedText: text.slice(0, 100_000),
        ...(ambiguousRuleStableIds.length
          ? {
              providerRecognitionAmbiguousRuleStableIds: ambiguousRuleStableIds,
            }
          : {}),
      };
      await this.recordSuccessfulParse(artifact.artifactStableId, result);
      if (!ambiguousRuleStableIds.length) {
        await this.suggestExpenseIfLikelyBill(
          artifact.artifactStableId,
          result,
        );
      }
      return false;
    }
    if (kind === AccountingArtifactKind.IMAGE) {
      const detected = detectAccountingReceiptImageType(buffer);
      if (!detected) throw new Error('unsupported image');
      const text = (await extractAccountingImageText(buffer)).text;
      const extraction = extractAccountingText(text);
      const review = text.trim()
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
        ocrStatus: 'SUCCESS',
      };
      await this.recordSuccessfulParse(artifact.artifactStableId, result);
      await this.suggestExpenseIfLikelyBill(artifact.artifactStableId, result);
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
    const provider = await this.providerFinancial.parseForInboxSuggestion({
      artifactStableId: artifact.artifactStableId,
      text,
      ...providerContext,
    });
    if (provider.matched) return;
    const ambiguousRuleStableIds =
      'ambiguousRuleStableIds' in provider
        ? provider.ambiguousRuleStableIds
        : [];
    const extraction = extractAccountingText(text);
    const result: TextReviewExtraction = {
      ...extraction,
      inputKind,
      ...classifyAccountingDocumentText(text, extraction),
      extractedText: text.slice(0, 100_000),
      ...(ambiguousRuleStableIds.length
        ? { providerRecognitionAmbiguousRuleStableIds: ambiguousRuleStableIds }
        : {}),
    };
    await this.recordSuccessfulParse(artifact.artifactStableId, result);
    if (!ambiguousRuleStableIds.length) {
      await this.suggestExpenseIfLikelyBill(artifact.artifactStableId, result);
    }
  }

  private async parseProviderEvidence(
    acquisitionMode: AccountingArtifactAcquisitionMode,
    input: AccountingProviderFinancialParseContext,
  ) {
    return acquisitionMode === AccountingArtifactAcquisitionMode.PROVIDER_API
      ? this.providerFinancial.parseAndMaterialize(input)
      : this.providerFinancial.parseForInboxSuggestion(input);
  }

  private async suggestExpenseIfLikelyBill(
    artifactStableId: string,
    result: TextReviewExtraction | ImageReviewExtraction,
  ) {
    if (result.reviewDisposition !== 'LIKELY_BILL') return;
    try {
      await this.operations.suggestUnifiedInboxClassification(
        artifactStableId,
        {
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Accounting Inbox expense suggestion failed for ${artifactStableId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
    const dir = path.join(getAccountingUploadsDir(), 'inbox');
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

  private async removeStoredFile(storedUrl: string): Promise<boolean> {
    const locations = [
      {
        prefix: '/api/v1/accounting/files/inbox/',
        directory: 'inbox',
      },
      {
        prefix: '/api/v1/accounting/files/image-retention/',
        directory: 'image-retention',
      },
    ] as const;
    const location = locations.find(({ prefix }) =>
      storedUrl.startsWith(prefix),
    );
    if (!location) {
      this.logger.warn(
        `Accounting storage cleanup refused unknown URL ${storedUrl}`,
      );
      return false;
    }
    const fileName = path.basename(storedUrl.slice(location.prefix.length));
    if (!fileName || storedUrl !== `${location.prefix}${fileName}`) {
      this.logger.warn(
        `Accounting storage cleanup refused invalid URL ${storedUrl}`,
      );
      return false;
    }
    try {
      await fs.promises.rm(
        path.join(getAccountingUploadsDir(), location.directory, fileName),
        { force: true },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to remove Accounting stored file ${fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
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
