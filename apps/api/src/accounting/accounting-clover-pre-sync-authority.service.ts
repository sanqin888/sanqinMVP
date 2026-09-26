import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingParseStatus,
  AccountingProviderFinancialReviewStatus,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE,
  CLOVER_CLOSEOUT_RAW_CODES,
} from './accounting-clover-closeout.contract';
import {
  projectCloverPreSyncAuthorityCoverage,
  type CloverPreSyncCloseoutBatchEvidenceV1,
  type CloverPreSyncStatementEvidenceV1,
} from './accounting-clover-pre-sync-authority.policy';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';
import { parseAccountingDocumentExtraction } from './accounting-document-extraction';
import {
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  extractCloverModernStatementAuthorityControls,
  type CloverModernStatementAuthorityControls,
} from './accounting-provider-financial.parser';
import { applyProviderFinancialReviewCorrections } from './accounting-provider-financial-review.policy';
import { PROVIDER_FINANCIAL_HISTORY_START_DATE } from './accounting-inbox-core.policy';
import { AccountingPeriodService } from './accounting-period.service';

type FinancialDocumentRow = Awaited<
  ReturnType<AccountingCloverPreSyncAuthorityService['readDocuments']>
>[number];

const dateOnly = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const nonNegativeInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

const rawTransactionCount = (value: unknown): number | null =>
  nonNegativeInteger(jsonRecord(value).transactionCount);

@Injectable()
export class AccountingCloverPreSyncAuthorityService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orderFacts: OrderFinancialFactsReaderPort,
    private readonly period: AccountingPeriodService,
  ) {}

  async shadow(params: {
    storeStableId: string;
    statementDocumentStableId?: string;
  }) {
    const storeStableId = params.storeStableId.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }
    const timezone = await this.period.getBusinessTimezone();
    const rows = await this.readDocuments(
      storeStableId,
      params.statementDocumentStableId?.trim() || undefined,
    );
    const latestStatementRevision = new Map<string, number>();
    for (const row of rows) {
      if (row.documentType !== AccountingFinancialDocumentType.STATEMENT) {
        continue;
      }
      latestStatementRevision.set(
        row.businessIdentityKey,
        Math.max(
          latestStatementRevision.get(row.businessIdentityKey) ?? 0,
          row.revision,
        ),
      );
    }
    const statements = rows.filter(
      (row) =>
        row.documentType === AccountingFinancialDocumentType.STATEMENT &&
        row.revision === latestStatementRevision.get(row.businessIdentityKey),
    );
    const closeouts = rows
      .filter(
        (row) =>
          row.documentType === AccountingFinancialDocumentType.BATCH_CONTROL,
      )
      .flatMap((row) => {
        const evidence = this.closeoutEvidence(row);
        return evidence ? [evidence] : [];
      });

    const projections = [];
    for (const row of statements) {
      const statement = this.statementEvidence(row);
      if (!statement) {
        projections.push({
          statementDocumentStableId: row.documentStableId,
          status: 'FAIL_CLOSED' as const,
          issues: ['STATEMENT_AUTHORITY_EVIDENCE_INCOMPLETE'],
          authority: this.authorityContract(),
        });
        continue;
      }
      const coverage = projectCloverPreSyncAuthorityCoverage({
        statement,
        closeouts,
      });
      const diagnosticRange = coverage.coveredCloseoutRange ?? {
        from: statement.periodStart,
        to: statement.periodEnd,
      };
      const fromInclusive = DateTime.fromISO(diagnosticRange.from, {
        zone: timezone,
      }).startOf('day');
      const toExclusive = DateTime.fromISO(diagnosticRange.to, {
        zone: timezone,
      })
        .plus({ days: 1 })
        .startOf('day');
      const facts =
        fromInclusive.isValid && toExclusive.isValid
          ? await this.orderFacts.readFactsForRange({
              storeStableId,
              fromInclusive: fromInclusive.toUTC().toJSDate(),
              toExclusive: toExclusive.toUTC().toJSDate(),
            })
          : [];
      const cardFacts = facts.filter((fact) => fact.paymentMethod === 'CARD');
      const orderCardAmountCents = cardFacts.reduce(
        (sum, fact) => sum + fact.paymentTotalCents,
        0,
      );

      projections.push({
        statementDocumentStableId: row.documentStableId,
        statementBusinessIdentityKey: row.businessIdentityKey,
        statementRevision: row.revision,
        statementPeriod: {
          from: statement.periodStart,
          to: statement.periodEnd,
        },
        statementPrincipalCents: statement.principalCents,
        coverage,
        composition: {
          rule: 'SUBMITTED_INCLUDES_TIPS_AND_SURCHARGE' as const,
          tipsAuthority: 'CLOVER_CLOSEOUT_PROVIDER_EVIDENCE' as const,
          surchargeAuthority:
            statement.explicitSurchargeCents == null
              ? ('UNKNOWN' as const)
              : ('CLOVER_STATEMENT_EXPLICIT_PROVIDER_EVIDENCE' as const),
        },
        orderCardDiagnostic: {
          authority: 'NON_AUTHORITATIVE' as const,
          paymentMethod: 'CARD' as const,
          range: diagnosticRange,
          count: cardFacts.length,
          amountCents: orderCardAmountCents,
          deltaToStatementPrincipalCents:
            orderCardAmountCents - statement.principalCents,
          sourceEvidenceCounts: cardFacts.reduce<Record<string, number>>(
            (counts, fact) => {
              counts[fact.sourceEvidence] =
                (counts[fact.sourceEvidence] ?? 0) + 1;
              return counts;
            },
            {},
          ),
        },
        authority: this.authorityContract(),
      });
    }

    return {
      version: 1,
      provider: AccountingFinancialProvider.CLOVER,
      storeStableId,
      accountingStartDate: PROVIDER_FINANCIAL_HISTORY_START_DATE,
      mutationMode: 'READ_ONLY_SHADOW' as const,
      projections,
    };
  }

  private authorityContract() {
    return {
      preSyncProviderPendingAuthority:
        'CLOVER_CLOSEOUT_PLUS_MONTHLY_STATEMENT' as const,
      settlementAuthority: 'REVIEWED_CIBC_BANK_EVIDENCE' as const,
      salesEconomicFactOwner: 'SANQ_ORDER' as const,
      historicalOrderCardRole: 'NON_AUTHORITATIVE_DIAGNOSTIC' as const,
      surchargeInference: 'PROHIBITED' as const,
    };
  }

  private statementEvidence(
    row: FinancialDocumentRow,
  ): CloverPreSyncStatementEvidenceV1 | null {
    const periodStart = dateOnly(row.periodStart);
    const periodEnd = dateOnly(row.periodEnd);
    if (!periodStart || !periodEnd || !row.providerMerchantRef) return null;
    const lines = this.effectiveStatementLines(row);
    const principalLine = lines.find(
      (line) =>
        line.rawCode === CLOVER_STATEMENT_RAW_CODES.ACCOUNT_AMOUNT_SUBMITTED ||
        /^Total Amount Submitted$|^Amount Submitted$/i.test(line.rawName ?? ''),
    );
    if (!principalLine) return null;
    const controls = this.statementAuthorityControls(row);
    const surchargeLine = lines.find(
      (line) => line.rawCode === CLOVER_STATEMENT_RAW_CODES.SURCHARGE_COLLECTED,
    );
    return {
      documentStableId: row.documentStableId,
      businessIdentityKey: row.businessIdentityKey,
      revision: row.revision,
      providerMerchantRef: row.providerMerchantRef,
      periodStart,
      periodEnd,
      principalCents: principalLine.amountCents,
      transactionCount: controls?.transactionCount ?? null,
      refundCount: controls?.refundCount ?? null,
      refundAmountCents: controls?.refundAmountCents ?? null,
      explicitSurchargeCents:
        surchargeLine?.amountCents ?? controls?.surchargeCollectedCents ?? null,
      activityControlAmountSubmittedCents:
        controls?.amountSubmittedCents ?? null,
    };
  }

  private effectiveStatementLines(row: FinancialDocumentRow) {
    const review = row.reviewRevisions[0] ?? null;
    if (!review) return row.lines;
    if (review.effectiveSnapshotParserName) {
      return review.effectiveLines.map((line) => ({
        lineStableId: line.reviewedLineStableId,
        lineNo: line.lineNo,
        rawCode: line.rawCode,
        rawName: line.rawName,
        component: line.component,
        postingTreatment: line.postingTreatment,
        taxRole: line.taxRole,
        amountCents: line.amountCents,
        rawPayload: null,
      }));
    }
    return applyProviderFinancialReviewCorrections({
      sourceLines: row.lines,
      corrections: review.corrections,
    });
  }

  private effectiveStatementRawMetadata(
    row: FinancialDocumentRow,
  ): Record<string, unknown> {
    const review = row.reviewRevisions[0] ?? null;
    if (!review?.effectiveSnapshotParserName) {
      return jsonRecord(row.rawMetadata);
    }
    return jsonRecord(
      jsonRecord(review.effectiveSnapshotParseRun?.resultJson).rawMetadata,
    );
  }

  private statementAuthorityControls(
    row: FinancialDocumentRow,
  ): CloverModernStatementAuthorityControls | null {
    const metadataControls = jsonRecord(
      this.effectiveStatementRawMetadata(row).authorityControls,
    );
    const fromMetadata = {
      transactionCount: nonNegativeInteger(metadataControls.transactionCount),
      amountSubmittedCents: integer(metadataControls.amountSubmittedCents),
      refundCount: nonNegativeInteger(metadataControls.refundCount),
      refundAmountCents: integer(metadataControls.refundAmountCents),
      surchargeCollectedCents: integer(
        metadataControls.surchargeCollectedCents,
      ),
    };
    if (
      fromMetadata.transactionCount != null &&
      fromMetadata.amountSubmittedCents != null &&
      fromMetadata.refundCount != null &&
      fromMetadata.refundAmountCents != null
    ) {
      return fromMetadata as CloverModernStatementAuthorityControls;
    }

    const review = row.reviewRevisions[0] ?? null;
    if (review?.effectiveSnapshotParserName) {
      const result = jsonRecord(review.effectiveSnapshotParseRun?.resultJson);
      const extraction = parseAccountingDocumentExtraction(
        result.documentExtraction,
      );
      const controls =
        extractCloverModernStatementAuthorityControls(extraction);
      if (controls) return controls;
    }

    for (const parseRun of row.artifact.parseRuns) {
      const result = jsonRecord(parseRun.resultJson);
      const extraction = parseAccountingDocumentExtraction(
        result.documentExtraction,
      );
      const controls =
        extractCloverModernStatementAuthorityControls(extraction);
      if (controls) return controls;
    }
    return null;
  }

  private closeoutEvidence(
    row: FinancialDocumentRow,
  ): CloverPreSyncCloseoutBatchEvidenceV1 | null {
    const businessDate = dateOnly(row.periodStart);
    if (
      !businessDate ||
      dateOnly(row.periodEnd) !== businessDate ||
      !row.providerMerchantRef ||
      !row.providerDocumentRef
    ) {
      return null;
    }
    const byRawCode = (rawCode: string) =>
      row.lines.find((line) => line.rawCode === rawCode);
    const sales = byRawCode(CLOVER_CLOSEOUT_RAW_CODES.SALES);
    const refunds = byRawCode(CLOVER_CLOSEOUT_RAW_CODES.REFUNDS);
    const tips = byRawCode(CLOVER_CLOSEOUT_RAW_CODES.TIPS);
    if (!sales || !refunds || !tips) return null;
    const salesCount = rawTransactionCount(sales.rawPayload);
    const refundCount = rawTransactionCount(refunds.rawPayload);
    const tipsCount = rawTransactionCount(tips.rawPayload);
    if (salesCount == null || refundCount == null || tipsCount == null) {
      return null;
    }
    return {
      documentStableId: row.documentStableId,
      batchId: row.providerDocumentRef,
      providerMerchantRef: row.providerMerchantRef,
      businessDate,
      salesCount,
      salesCents: sales.amountCents,
      refundCount,
      refundCents: refunds.amountCents,
      tipsCount,
      tipsCents: tips.amountCents,
    };
  }

  readDocuments(storeStableId: string, statementDocumentStableId?: string) {
    return this.prisma.accountingProviderFinancialDocument.findMany({
      where: {
        provider: AccountingFinancialProvider.CLOVER,
        storeStableId,
        documentType: {
          in: [
            AccountingFinancialDocumentType.STATEMENT,
            AccountingFinancialDocumentType.BATCH_CONTROL,
          ],
        },
        OR: [
          {
            documentType: AccountingFinancialDocumentType.STATEMENT,
            periodEnd: {
              gte: new Date(
                `${PROVIDER_FINANCIAL_HISTORY_START_DATE}T00:00:00.000Z`,
              ),
            },
            ...(statementDocumentStableId
              ? { documentStableId: statementDocumentStableId }
              : {}),
          },
          {
            documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
            periodStart: {
              gte: new Date(
                `${CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE}T00:00:00.000Z`,
              ),
            },
          },
        ],
      },
      select: {
        documentStableId: true,
        documentType: true,
        businessIdentityKey: true,
        revision: true,
        providerMerchantRef: true,
        providerDocumentRef: true,
        periodStart: true,
        periodEnd: true,
        rawMetadata: true,
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
            rawPayload: true,
          },
          orderBy: { lineNo: 'asc' },
        },
        reviewRevisions: {
          where: {
            status: AccountingProviderFinancialReviewStatus.CONFIRMED,
          },
          orderBy: { revision: 'desc' },
          take: 1,
          select: {
            effectiveSnapshotParserName: true,
            effectiveSnapshotParseRun: {
              select: { resultJson: true },
            },
            effectiveLines: {
              select: {
                reviewedLineStableId: true,
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
            corrections: {
              select: {
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
        },
        artifact: {
          select: {
            parseRuns: {
              where: {
                parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
                status: AccountingParseStatus.SUCCESS,
              },
              select: {
                parserVersion: true,
                resultJson: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: [
        { periodStart: 'asc' },
        { businessIdentityKey: 'asc' },
        { revision: 'asc' },
      ],
    });
  }
}
