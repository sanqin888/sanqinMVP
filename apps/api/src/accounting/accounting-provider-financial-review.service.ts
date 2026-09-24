import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCOUNTING_DB,
  type AccountingDb,
  type AccountingJsonValue,
  type AccountingTransactionClient,
} from './accounting-db';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingParseStatus,
  AccountingProviderFinancialReviewStatus,
  type AccountingProviderFinancialReviewStatus as AccountingProviderFinancialReviewStatusValue,
} from './accounting-contracts';
import {
  parseAccountingDocumentExtraction,
  type AccountingDocumentExtraction,
} from './accounting-document-extraction';
import {
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
  parseProviderFinancialEvidence,
  type ParsedProviderFinancialDocument,
} from './accounting-provider-financial.parser';
import {
  hashAccountingJson,
  normalizeAccountingParseRun,
} from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
  recordParseRunInTx,
} from './accounting-inbox-core.writer';
import {
  AccountingProviderFinancialReviewPolicyError,
  normalizeProviderFinancialReviewDraft,
  type ProviderFinancialReviewDraftInput,
} from './accounting-provider-financial-review.policy';

const PROVIDER_FINANCIAL_SOURCE_FACT_TYPE =
  'accounting.provider_financial_document.v1';

const requireStableValue = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`${field} is required`);
  }
  return normalized;
};

const requireReviewHash = (value: string): string => {
  const normalized = value?.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new BadRequestException(
      'expectedReviewHash must be a lowercase SHA-256 hex digest',
    );
  }
  return normalized;
};

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const requireReevaluationText = (
  resultJson: unknown,
): {
  text: string;
  documentExtraction?: AccountingDocumentExtraction;
} => {
  const result = jsonRecord(resultJson);
  const text =
    typeof result.extractedText === 'string' ? result.extractedText : '';
  if (!text.trim()) {
    throw new ConflictException(
      'provider parser re-evaluation requires persisted extracted text evidence',
    );
  }
  const documentExtraction = parseAccountingDocumentExtraction(
    result.documentExtraction,
  );
  if (result.documentExtraction !== undefined && !documentExtraction) {
    throw new ConflictException(
      'provider parser re-evaluation extraction geometry is invalid',
    );
  }
  return {
    text,
    ...(documentExtraction ? { documentExtraction } : {}),
  };
};

const assertReevaluationIdentity = (params: {
  document: {
    provider: ParsedProviderFinancialDocument['provider'];
    documentType: ParsedProviderFinancialDocument['documentType'];
    businessIdentityKey: string;
    providerMerchantRef: string | null;
    providerDocumentRef: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    currency: string;
  };
  parsed: ParsedProviderFinancialDocument;
}) => {
  const expected = {
    provider: params.document.provider,
    documentType: params.document.documentType,
    businessIdentityKey: params.document.businessIdentityKey,
    providerMerchantRef: params.document.providerMerchantRef,
    providerDocumentRef: params.document.providerDocumentRef,
    periodStart: dateOnly(params.document.periodStart),
    periodEnd: dateOnly(params.document.periodEnd),
    currency: params.document.currency,
  };
  const actual = {
    provider: params.parsed.provider,
    documentType: params.parsed.documentType,
    businessIdentityKey: params.parsed.businessIdentityKey,
    providerMerchantRef: params.parsed.providerMerchantRef,
    providerDocumentRef: params.parsed.providerDocumentRef,
    periodStart: params.parsed.periodStart,
    periodEnd: params.parsed.periodEnd,
    currency: params.parsed.currency,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (expected[key] !== actual[key]) {
      throw new ConflictException(
        `provider parser re-evaluation changed document identity field: ${key}`,
      );
    }
  }
};

@Injectable()
export class AccountingProviderFinancialReviewService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listReviewRevisions(documentStableId: string) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const document =
      await this.prisma.accountingProviderFinancialDocument.findUnique({
        where: { documentStableId: stableId },
        select: { id: true },
      });
    if (!document) {
      throw new NotFoundException('provider financial document not found');
    }
    const rows =
      await this.prisma.accountingProviderFinancialReviewRevision.findMany({
        where: { documentId: document.id },
        select: {
          reviewRevisionStableId: true,
          revision: true,
          status: true,
          reviewHash: true,
          note: true,
          effectiveSnapshotParserName: true,
          effectiveSnapshotParserVersion: true,
          effectiveSnapshotParseRun: {
            select: { parseRunStableId: true },
          },
          effectiveSnapshotSourceParseRun: {
            select: { parseRunStableId: true },
          },
          createdByUserStableId: true,
          confirmedByUserStableId: true,
          confirmedAt: true,
          createdAt: true,
          updatedAt: true,
          effectiveLines: {
            select: {
              reviewedLineStableId: true,
              lineNo: true,
              sourceLineStableId: true,
              rawCode: true,
              rawName: true,
              component: true,
              postingTreatment: true,
              taxRole: true,
              amountCents: true,
              occurredAt: true,
            },
            orderBy: { lineNo: 'asc' },
          },
          corrections: {
            select: {
              correctionStableId: true,
              sourceLineStableId: true,
              reason: true,
              note: true,
              effectiveRawCode: true,
              effectiveRawName: true,
              effectiveComponent: true,
              effectivePostingTreatment: true,
              effectiveTaxRole: true,
              effectiveAmountCents: true,
            },
            orderBy: { sourceLineStableId: 'asc' },
          },
        },
        orderBy: { revision: 'desc' },
      });
    return rows.map((row) => this.toReviewRevisionDto(row));
  }

  async createDraft(
    documentStableId: string,
    input: ProviderFinancialReviewDraftInput,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );
    try {
      return await runSerializableAccountingWrite(this.prisma, async (tx) => {
        const document =
          await tx.accountingProviderFinancialDocument.findUnique({
            where: { documentStableId: stableId },
            select: {
              id: true,
              documentStableId: true,
              provider: true,
              documentType: true,
              businessIdentityKey: true,
              revision: true,
              lines: {
                select: {
                  lineStableId: true,
                  lineNo: true,
                  rawCode: true,
                  rawName: true,
                  component: true,
                  postingTreatment: true,
                  taxRole: true,
                  amountCents: true,
                },
                orderBy: { lineNo: 'asc' },
              },
            },
          });
        if (!document) {
          throw new NotFoundException('provider financial document not found');
        }

        const latestDocument =
          await tx.accountingProviderFinancialDocument.findFirst({
            where: {
              provider: document.provider,
              documentType: document.documentType,
              businessIdentityKey: document.businessIdentityKey,
            },
            orderBy: { revision: 'desc' },
            select: { documentStableId: true, revision: true },
          });
        if (
          latestDocument?.documentStableId !== document.documentStableId ||
          latestDocument.revision !== document.revision
        ) {
          throw new ConflictException(
            'human review must target the latest provider document revision',
          );
        }

        const normalized = normalizeProviderFinancialReviewDraft({
          documentType: document.documentType,
          sourceLines: document.lines,
          input,
        });
        if (normalized.expectedDocumentRevision !== document.revision) {
          throw new ConflictException(
            'provider document revision changed before human review draft creation',
          );
        }

        await this.assertDocumentNotPostedInTx(tx, document.documentStableId);

        const latestReview =
          await tx.accountingProviderFinancialReviewRevision.findFirst({
            where: { documentId: document.id },
            orderBy: { revision: 'desc' },
            select: {
              revision: true,
              status: true,
              effectiveSnapshotParserName: true,
            },
          });
        if (
          latestReview?.effectiveSnapshotParserName &&
          latestReview.status !==
            AccountingProviderFinancialReviewStatus.SUPERSEDED
        ) {
          throw new ConflictException(
            'manual line corrections cannot replace an active parser effective snapshot',
          );
        }
        const reviewRevision = (latestReview?.revision ?? 0) + 1;
        const reviewHash = hashAccountingJson({
          version: 1,
          documentStableId: document.documentStableId,
          documentRevision: document.revision,
          reviewRevision,
          note: normalized.note,
          corrections: normalized.corrections,
        });
        const auditCorrections = normalized.corrections.map((correction) => {
          const sourceLine =
            document.lines.find(
              (line) => line.lineStableId === correction.sourceLineStableId,
            ) ?? null;
          return {
            sourceLineStableId: correction.sourceLineStableId,
            reason: correction.reason,
            note: correction.note,
            before: sourceLine
              ? {
                  rawCode: sourceLine.rawCode,
                  rawName: sourceLine.rawName,
                  component: sourceLine.component,
                  postingTreatment: sourceLine.postingTreatment,
                  taxRole: sourceLine.taxRole,
                  amountCents: sourceLine.amountCents,
                }
              : null,
            effective: {
              rawCode: correction.effectiveRawCode,
              rawName: correction.effectiveRawName,
              component: correction.effectiveComponent,
              postingTreatment: correction.effectivePostingTreatment,
              taxRole: correction.effectiveTaxRole,
              amountCents: correction.effectiveAmountCents,
            },
          };
        });

        await tx.accountingProviderFinancialReviewRevision.updateMany({
          where: {
            documentId: document.id,
            status: AccountingProviderFinancialReviewStatus.DRAFT,
          },
          data: {
            status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
          },
        });

        const created =
          await tx.accountingProviderFinancialReviewRevision.create({
            data: {
              documentId: document.id,
              revision: reviewRevision,
              status: AccountingProviderFinancialReviewStatus.DRAFT,
              reviewHash,
              note: normalized.note,
              createdByUserStableId: operator,
              ...(normalized.corrections.length > 0
                ? {
                    corrections: {
                      create: normalized.corrections.map((correction) => ({
                        sourceLineStableId: correction.sourceLineStableId,
                        reason: correction.reason,
                        note: correction.note,
                        effectiveRawCode: correction.effectiveRawCode,
                        effectiveRawName: correction.effectiveRawName,
                        effectiveComponent: correction.effectiveComponent,
                        effectivePostingTreatment:
                          correction.effectivePostingTreatment,
                        effectiveTaxRole: correction.effectiveTaxRole,
                        effectiveAmountCents: correction.effectiveAmountCents,
                      })),
                    },
                  }
                : {}),
            },
            select: {
              reviewRevisionStableId: true,
              revision: true,
              status: true,
              reviewHash: true,
              note: true,
              effectiveSnapshotParserName: true,
              effectiveSnapshotParserVersion: true,
              effectiveSnapshotParseRun: {
                select: { parseRunStableId: true },
              },
              effectiveSnapshotSourceParseRun: {
                select: { parseRunStableId: true },
              },
              createdByUserStableId: true,
              confirmedByUserStableId: true,
              confirmedAt: true,
              createdAt: true,
              updatedAt: true,
              effectiveLines: {
                select: {
                  reviewedLineStableId: true,
                  lineNo: true,
                  sourceLineStableId: true,
                  rawCode: true,
                  rawName: true,
                  component: true,
                  postingTreatment: true,
                  taxRole: true,
                  amountCents: true,
                  occurredAt: true,
                },
                orderBy: { lineNo: 'asc' },
              },
              corrections: {
                select: {
                  correctionStableId: true,
                  sourceLineStableId: true,
                  reason: true,
                  note: true,
                  effectiveRawCode: true,
                  effectiveRawName: true,
                  effectiveComponent: true,
                  effectivePostingTreatment: true,
                  effectiveTaxRole: true,
                  effectiveAmountCents: true,
                },
                orderBy: { sourceLineStableId: 'asc' },
              },
            },
          });

        await tx.accountingAuditLog.create({
          data: {
            action: 'CREATE_REVIEW_DRAFT',
            entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
            entityId: created.reviewRevisionStableId,
            operatorActorRef: operator,
            afterJson: {
              documentStableId: document.documentStableId,
              documentRevision: document.revision,
              reviewRevision: created.revision,
              reviewHash: created.reviewHash,
              correctionCount: created.corrections.length,
              corrections: auditCorrections,
            },
          },
        });

        return this.toReviewRevisionDto(created);
      });
    } catch (error) {
      if (error instanceof AccountingProviderFinancialReviewPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async createParserReevaluationDraft(
    documentStableId: string,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const document =
        await tx.accountingProviderFinancialDocument.findUnique({
          where: { documentStableId: stableId },
          select: {
            id: true,
            artifactId: true,
            documentStableId: true,
            provider: true,
            documentType: true,
            businessIdentityKey: true,
            revision: true,
            providerMerchantRef: true,
            providerDocumentRef: true,
            periodStart: true,
            periodEnd: true,
            currency: true,
            parserName: true,
            parserVersion: true,
            artifact: {
              select: {
                artifactStableId: true,
                originalFilename: true,
                emailSubject: true,
              },
            },
          },
        });
      if (!document) {
        throw new NotFoundException('provider financial document not found');
      }
      if (document.parserName !== ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME) {
        throw new ConflictException(
          'provider parser re-evaluation is not supported for this parser',
        );
      }
      if (
        document.parserVersion === ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION
      ) {
        throw new ConflictException(
          'provider financial document already uses the current parser version',
        );
      }

      const latestDocument =
        await tx.accountingProviderFinancialDocument.findFirst({
          where: {
            provider: document.provider,
            documentType: document.documentType,
            businessIdentityKey: document.businessIdentityKey,
          },
          orderBy: { revision: 'desc' },
          select: { documentStableId: true, revision: true },
        });
      if (
        latestDocument?.documentStableId !== document.documentStableId ||
        latestDocument.revision !== document.revision
      ) {
        throw new ConflictException(
          'parser re-evaluation must target the latest provider document revision',
        );
      }

      await this.assertDocumentNotPostedInTx(tx, document.documentStableId);

      const currentParserSnapshot =
        await tx.accountingProviderFinancialReviewRevision.findFirst({
          where: {
            documentId: document.id,
            status: {
              in: [
                AccountingProviderFinancialReviewStatus.DRAFT,
                AccountingProviderFinancialReviewStatus.CONFIRMED,
              ],
            },
            effectiveSnapshotParserName:
              ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
            effectiveSnapshotParserVersion:
              ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
          },
          orderBy: { revision: 'desc' },
          select: {
            reviewRevisionStableId: true,
            revision: true,
            status: true,
          },
        });
      if (currentParserSnapshot) {
        throw new ConflictException(
          `current parser already has a ${currentParserSnapshot.status} review snapshot v${currentParserSnapshot.revision}`,
        );
      }

      const sourceParseRuns = await tx.accountingParseRun.findMany({
        where: {
          artifactId: document.artifactId,
          status: AccountingParseStatus.SUCCESS,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          parseRunStableId: true,
          parserName: true,
          parserVersion: true,
          resultHash: true,
          resultJson: true,
        },
      });
      const existingCurrentParseRun =
        sourceParseRuns.find(
          (run) =>
            run.parserName === ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME &&
            run.parserVersion === ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        ) ?? null;
      const sourceParseRun =
        sourceParseRuns.find((run) => {
          if (run.id === existingCurrentParseRun?.id) return false;
          const result = jsonRecord(run.resultJson);
          return (
            typeof result.extractedText === 'string' &&
            Boolean(result.extractedText.trim())
          );
        }) ??
        (existingCurrentParseRun &&
        typeof jsonRecord(existingCurrentParseRun.resultJson).extractedText ===
          'string' &&
        Boolean(
          (
            jsonRecord(existingCurrentParseRun.resultJson)
              .extractedText as string
          ).trim(),
        )
          ? existingCurrentParseRun
          : null);
      if (!sourceParseRun) {
        throw new ConflictException(
          'provider parser re-evaluation source extraction evidence is unavailable',
        );
      }

      const sourceEvidence = requireReevaluationText(sourceParseRun.resultJson);
      const parsed = parseProviderFinancialEvidence({
        text: sourceEvidence.text,
        ...(sourceEvidence.documentExtraction
          ? { documentExtraction: sourceEvidence.documentExtraction }
          : {}),
        originalFilename: document.artifact.originalFilename,
        emailSubject: document.artifact.emailSubject,
        providerHint: document.provider,
        documentTypeHint: document.documentType,
      });
      if (!parsed) {
        throw new ConflictException(
          'current provider parser could not re-evaluate the persisted source evidence',
        );
      }
      assertReevaluationIdentity({ document, parsed });

      const sourceResult = jsonRecord(sourceParseRun.resultJson);
      const reevaluationResultJson = {
        providerFinancial: true,
        provider: parsed.provider,
        documentType: parsed.documentType,
        businessIdentityKey: parsed.businessIdentityKey,
        providerMerchantRef: parsed.providerMerchantRef,
        providerDocumentRef: parsed.providerDocumentRef,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        currency: parsed.currency,
        lineCount: parsed.lines.length,
        lines: parsed.lines,
        rawMetadata: parsed.rawMetadata,
        extractedText: sourceEvidence.text.slice(0, 100_000),
        ...(sourceEvidence.documentExtraction
          ? { documentExtraction: sourceEvidence.documentExtraction }
          : {}),
        ...(sourceResult.pdfNativeTextUsability === undefined
          ? {}
          : {
              pdfNativeTextUsability: sourceResult.pdfNativeTextUsability,
            }),
        ...(sourceResult.pdfOcrEvidence === undefined
          ? {}
          : { pdfOcrEvidence: sourceResult.pdfOcrEvidence }),
      };
      const reevaluationResultHash = hashAccountingJson(reevaluationResultJson);
      const normalizedParseRun = normalizeAccountingParseRun({
        artifactStableId: document.artifact.artifactStableId,
        parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
        parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        status: AccountingParseStatus.SUCCESS,
        resultHash: reevaluationResultHash,
        resultJson: reevaluationResultJson,
      });

      let reevaluationParseRun: {
        id: string;
        parseRunStableId: string;
        resultHash: string | null;
      };
      if (existingCurrentParseRun) {
        if (existingCurrentParseRun.resultHash !== reevaluationResultHash) {
          throw new ConflictException(
            'existing current provider parser ParseRun does not match deterministic re-evaluation',
          );
        }
        reevaluationParseRun = {
          id: existingCurrentParseRun.id,
          parseRunStableId: existingCurrentParseRun.parseRunStableId,
          resultHash: existingCurrentParseRun.resultHash,
        };
      } else {
        try {
          await recordParseRunInTx(tx, normalizedParseRun);
        } catch (error) {
          if (error instanceof AccountingInboxWriterConflictError) {
            throw new ConflictException(error.message);
          }
          if (error instanceof AccountingInboxWriterNotFoundError) {
            throw new NotFoundException(error.message);
          }
          throw error;
        }
        const persistedParseRun = await tx.accountingParseRun.findUnique({
          where: { idempotencyKey: normalizedParseRun.idempotencyKey },
          select: {
            id: true,
            parseRunStableId: true,
            resultHash: true,
          },
        });
        if (!persistedParseRun) {
          throw new ConflictException(
            'current provider parser re-evaluation ParseRun was not persisted',
          );
        }
        reevaluationParseRun = persistedParseRun;
      }

      const snapshotLines = parsed.lines.map((line, index) => ({
        lineNo: index + 1,
        sourceLineStableId: null,
        rawCode: line.rawCode ?? null,
        rawName: line.rawName,
        component: line.component,
        postingTreatment: line.postingTreatment,
        taxRole: line.taxRole,
        amountCents: line.amountCents,
        occurredAt: null,
        rawPayload: line.rawPayload ?? null,
      }));
      if (snapshotLines.length === 0) {
        throw new ConflictException(
          'current provider parser produced an empty effective snapshot',
        );
      }

      const latestReview =
        await tx.accountingProviderFinancialReviewRevision.findFirst({
          where: { documentId: document.id },
          orderBy: { revision: 'desc' },
          select: { revision: true },
        });
      const reviewRevision = (latestReview?.revision ?? 0) + 1;
      const reviewHash = hashAccountingJson({
        version: 2,
        kind: 'PARSER_REEVALUATION_EFFECTIVE_SNAPSHOT',
        documentStableId: document.documentStableId,
        documentRevision: document.revision,
        reviewRevision,
        parser: {
          name: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
          version: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
          parseRunStableId: reevaluationParseRun.parseRunStableId,
          resultHash: reevaluationParseRun.resultHash,
          sourceParseRunStableId: sourceParseRun.parseRunStableId,
          sourceResultHash: sourceParseRun.resultHash,
        },
        effectiveLines: snapshotLines,
      });

      await tx.accountingProviderFinancialReviewRevision.updateMany({
        where: {
          documentId: document.id,
          status: AccountingProviderFinancialReviewStatus.DRAFT,
        },
        data: {
          status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
        },
      });

      const created =
        await tx.accountingProviderFinancialReviewRevision.create({
          data: {
            documentId: document.id,
            revision: reviewRevision,
            status: AccountingProviderFinancialReviewStatus.DRAFT,
            reviewHash,
            note:
              `Parser re-evaluation ${document.parserName} v${document.parserVersion} -> ` +
              `v${ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION}`,
            effectiveSnapshotParserName:
              ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
            effectiveSnapshotParserVersion:
              ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
            effectiveSnapshotParseRunId: reevaluationParseRun.id,
            effectiveSnapshotSourceParseRunId: sourceParseRun.id,
            createdByUserStableId: operator,
            effectiveLines: {
              create: snapshotLines.map((line) => ({
                lineNo: line.lineNo,
                sourceLineStableId: line.sourceLineStableId,
                rawCode: line.rawCode,
                rawName: line.rawName,
                component: line.component,
                postingTreatment: line.postingTreatment,
                taxRole: line.taxRole,
                amountCents: line.amountCents,
                occurredAt: line.occurredAt,
                ...(line.rawPayload
                  ? { rawPayload: line.rawPayload as AccountingJsonValue }
                  : {}),
              })),
            },
          },
          select: {
            reviewRevisionStableId: true,
            revision: true,
            status: true,
            reviewHash: true,
            note: true,
            effectiveSnapshotParserName: true,
            effectiveSnapshotParserVersion: true,
            effectiveSnapshotParseRun: {
              select: { parseRunStableId: true },
            },
            effectiveSnapshotSourceParseRun: {
              select: { parseRunStableId: true },
            },
            createdByUserStableId: true,
            confirmedByUserStableId: true,
            confirmedAt: true,
            createdAt: true,
            updatedAt: true,
            effectiveLines: {
              select: {
                reviewedLineStableId: true,
                lineNo: true,
                sourceLineStableId: true,
                rawCode: true,
                rawName: true,
                component: true,
                postingTreatment: true,
                taxRole: true,
                amountCents: true,
                occurredAt: true,
              },
              orderBy: { lineNo: 'asc' },
            },
            corrections: {
              select: {
                correctionStableId: true,
                sourceLineStableId: true,
                reason: true,
                note: true,
                effectiveRawCode: true,
                effectiveRawName: true,
                effectiveComponent: true,
                effectivePostingTreatment: true,
                effectiveTaxRole: true,
                effectiveAmountCents: true,
              },
              orderBy: { sourceLineStableId: 'asc' },
            },
          },
        });

      await tx.accountingAuditLog.create({
        data: {
          action: 'CREATE_PARSER_REEVALUATION_REVIEW_DRAFT',
          entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
          entityId: created.reviewRevisionStableId,
          operatorActorRef: operator,
          afterJson: {
            documentStableId: document.documentStableId,
            documentRevision: document.revision,
            reviewRevision: created.revision,
            reviewHash: created.reviewHash,
            sourceExtractionParserName: sourceParseRun.parserName,
            sourceExtractionParserVersion: sourceParseRun.parserVersion,
            sourceParseRunStableId: sourceParseRun.parseRunStableId,
            sourceResultHash: sourceParseRun.resultHash,
            materializedParserName: document.parserName,
            materializedParserVersion: document.parserVersion,
            effectiveParseRunStableId: reevaluationParseRun.parseRunStableId,
            effectiveParserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
            effectiveParserVersion:
              ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
            effectiveResultHash: reevaluationParseRun.resultHash,
            effectiveLineCount: created.effectiveLines.length,
          },
        },
      });

      return this.toReviewRevisionDto(created);
    });
  }

  async confirmRevision(
    documentStableId: string,
    reviewRevisionStableId: string,
    expectedReviewHash: string,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const reviewStableId = requireStableValue(
      reviewRevisionStableId,
      'reviewRevisionStableId',
    );
    const expectedHash = requireReviewHash(expectedReviewHash);
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const review =
        await tx.accountingProviderFinancialReviewRevision.findUnique({
          where: { reviewRevisionStableId: reviewStableId },
          select: {
            id: true,
            reviewRevisionStableId: true,
            revision: true,
            status: true,
            reviewHash: true,
            documentId: true,
            effectiveSnapshotParserName: true,
            effectiveSnapshotParserVersion: true,
            effectiveSnapshotParseRun: {
              select: {
                parseRunStableId: true,
                artifactId: true,
                parserName: true,
                parserVersion: true,
                status: true,
                resultJson: true,
              },
            },
            effectiveSnapshotSourceParseRun: {
              select: {
                parseRunStableId: true,
                artifactId: true,
                status: true,
              },
            },
            effectiveLines: {
              select: { id: true },
              take: 1,
            },
            corrections: {
              select: { id: true },
              take: 1,
            },
            document: {
              select: {
                documentStableId: true,
                artifactId: true,
                provider: true,
                documentType: true,
                businessIdentityKey: true,
                revision: true,
              },
            },
          },
        });
      if (!review || review.document.documentStableId !== stableId) {
        throw new NotFoundException(
          'provider financial review revision not found',
        );
      }
      if (review.effectiveSnapshotParserName) {
        const effectiveParseResult = jsonRecord(
          review.effectiveSnapshotParseRun?.resultJson,
        );
        const effectiveRawMetadata = effectiveParseResult.rawMetadata;
        if (
          !review.effectiveSnapshotParserVersion ||
          !review.effectiveSnapshotParseRun ||
          !review.effectiveSnapshotSourceParseRun ||
          review.effectiveSnapshotSourceParseRun.status !==
            AccountingParseStatus.SUCCESS ||
          review.effectiveSnapshotParseRun.artifactId !==
            review.document.artifactId ||
          review.effectiveSnapshotSourceParseRun.artifactId !==
            review.document.artifactId ||
          !effectiveRawMetadata ||
          typeof effectiveRawMetadata !== 'object' ||
          Array.isArray(effectiveRawMetadata) ||
          review.effectiveLines.length === 0 ||
          review.corrections.length > 0 ||
          review.effectiveSnapshotParseRun.status !==
            AccountingParseStatus.SUCCESS ||
          review.effectiveSnapshotParseRun.parserName !==
            review.effectiveSnapshotParserName ||
          review.effectiveSnapshotParseRun.parserVersion !==
            review.effectiveSnapshotParserVersion
        ) {
          throw new ConflictException(
            'parser effective snapshot review is incomplete or inconsistent',
          );
        }
      } else if (
        review.effectiveSnapshotParserVersion ||
        review.effectiveSnapshotParseRun ||
        review.effectiveSnapshotSourceParseRun ||
        review.effectiveLines.length > 0
      ) {
        throw new ConflictException(
          'review effective snapshot metadata is inconsistent',
        );
      }
      if (
        review.status === AccountingProviderFinancialReviewStatus.CONFIRMED &&
        review.reviewHash === expectedHash
      ) {
        return this.readRevisionInTx(tx, reviewStableId);
      }
      if (review.status !== AccountingProviderFinancialReviewStatus.DRAFT) {
        throw new ConflictException(
          'only the current DRAFT human review revision can be confirmed',
        );
      }
      if (review.reviewHash !== expectedHash) {
        throw new ConflictException(
          'human review content changed before confirmation',
        );
      }

      const latestReview =
        await tx.accountingProviderFinancialReviewRevision.findFirst({
          where: { documentId: review.documentId },
          orderBy: { revision: 'desc' },
          select: {
            reviewRevisionStableId: true,
            revision: true,
            status: true,
          },
        });
      if (
        latestReview?.reviewRevisionStableId !==
          review.reviewRevisionStableId ||
        latestReview.revision !== review.revision ||
        latestReview.status !== AccountingProviderFinancialReviewStatus.DRAFT
      ) {
        throw new ConflictException(
          'a newer human review revision exists; confirm the latest draft instead',
        );
      }

      const latestDocument =
        await tx.accountingProviderFinancialDocument.findFirst({
          where: {
            provider: review.document.provider,
            documentType: review.document.documentType,
            businessIdentityKey: review.document.businessIdentityKey,
          },
          orderBy: { revision: 'desc' },
          select: { documentStableId: true, revision: true },
        });
      if (
        latestDocument?.documentStableId !== review.document.documentStableId ||
        latestDocument.revision !== review.document.revision
      ) {
        throw new ConflictException(
          'provider document changed before human review confirmation',
        );
      }

      await this.assertDocumentNotPostedInTx(
        tx,
        review.document.documentStableId,
      );

      await tx.accountingProviderFinancialReviewRevision.updateMany({
        where: {
          documentId: review.documentId,
          status: AccountingProviderFinancialReviewStatus.CONFIRMED,
          NOT: { id: review.id },
        },
        data: {
          status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
        },
      });
      const confirmedAt = new Date();
      await tx.accountingProviderFinancialReviewRevision.update({
        where: { id: review.id },
        data: {
          status: AccountingProviderFinancialReviewStatus.CONFIRMED,
          confirmedAt,
          confirmedByUserStableId: operator,
        },
      });
      await tx.accountingAuditLog.create({
        data: {
          action: 'CONFIRM_REVIEW',
          entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
          entityId: review.reviewRevisionStableId,
          operatorActorRef: operator,
          afterJson: {
            documentStableId: review.document.documentStableId,
            documentRevision: review.document.revision,
            reviewRevision: review.revision,
            reviewHash: review.reviewHash,
            confirmedAt: confirmedAt.toISOString(),
          },
        },
      });

      return this.readRevisionInTx(tx, reviewStableId);
    });
  }

  private async assertDocumentNotPostedInTx(
    tx: AccountingTransactionClient,
    documentStableId: string,
  ) {
    const existing = await tx.accountingJournalEntry.findFirst({
      where: {
        deletedAt: null,
        sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
        sourceFactStableId: documentStableId,
      },
      select: { entryStableId: true },
    });
    if (existing) {
      throw new ConflictException(
        'posted provider financial evidence cannot be changed by human review',
      );
    }
  }

  private async readRevisionInTx(
    tx: AccountingTransactionClient,
    reviewRevisionStableId: string,
  ) {
    const row = await tx.accountingProviderFinancialReviewRevision.findUnique({
      where: { reviewRevisionStableId },
      select: {
        reviewRevisionStableId: true,
        revision: true,
        status: true,
        reviewHash: true,
        note: true,
        effectiveSnapshotParserName: true,
        effectiveSnapshotParserVersion: true,
        effectiveSnapshotParseRun: {
          select: { parseRunStableId: true },
        },
        effectiveSnapshotSourceParseRun: {
          select: { parseRunStableId: true },
        },
        createdByUserStableId: true,
        confirmedByUserStableId: true,
        confirmedAt: true,
        createdAt: true,
        updatedAt: true,
        effectiveLines: {
          select: {
            reviewedLineStableId: true,
            lineNo: true,
            sourceLineStableId: true,
            rawCode: true,
            rawName: true,
            component: true,
            postingTreatment: true,
            taxRole: true,
            amountCents: true,
            occurredAt: true,
          },
          orderBy: { lineNo: 'asc' },
        },
        corrections: {
          select: {
            correctionStableId: true,
            sourceLineStableId: true,
            reason: true,
            note: true,
            effectiveRawCode: true,
            effectiveRawName: true,
            effectiveComponent: true,
            effectivePostingTreatment: true,
            effectiveTaxRole: true,
            effectiveAmountCents: true,
          },
          orderBy: { sourceLineStableId: 'asc' },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(
        'provider financial review revision not found',
      );
    }
    return this.toReviewRevisionDto(row);
  }

  private toReviewRevisionDto(row: {
    reviewRevisionStableId: string;
    revision: number;
    status: AccountingProviderFinancialReviewStatusValue;
    reviewHash: string;
    note: string | null;
    effectiveSnapshotParserName: string | null;
    effectiveSnapshotParserVersion: string | null;
    effectiveSnapshotParseRun: {
      parseRunStableId: string;
    } | null;
    effectiveSnapshotSourceParseRun: {
      parseRunStableId: string;
    } | null;
    createdByUserStableId: string;
    confirmedByUserStableId: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    effectiveLines: Array<{
      reviewedLineStableId: string;
      lineNo: number;
      sourceLineStableId: string | null;
      rawCode: string | null;
      rawName: string | null;
      component: string;
      postingTreatment: string;
      taxRole: string;
      amountCents: number;
      occurredAt: Date | null;
    }>;
    corrections: Array<{
      correctionStableId: string;
      sourceLineStableId: string;
      reason: string;
      note: string | null;
      effectiveRawCode: string | null;
      effectiveRawName: string | null;
      effectiveComponent: string;
      effectivePostingTreatment: string;
      effectiveTaxRole: string;
      effectiveAmountCents: number;
    }>;
  }) {
    const {
      effectiveSnapshotParseRun,
      effectiveSnapshotSourceParseRun,
      effectiveLines,
      ...base
    } = row;
    return {
      ...base,
      effectiveSnapshotParseRunStableId:
        effectiveSnapshotParseRun?.parseRunStableId ?? null,
      effectiveSnapshotSourceParseRunStableId:
        effectiveSnapshotSourceParseRun?.parseRunStableId ?? null,
      effectiveLines: effectiveLines.map((line) => ({
        ...line,
        occurredAt: line.occurredAt?.toISOString() ?? null,
      })),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
