import { Inject, Injectable } from '@nestjs/common';
import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingParseStatus,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  UBER_ACCOUNTING_REPORT_EVIDENCE_KIND,
  type UberAccountingReportEvidenceKind,
} from './accounting-uber-reporting.contract';
import {
  reconcileUberReportingEvidence,
  type UberReportingPayoutControl,
  type UberReportingReconciliationEvidence,
} from './accounting-uber-reporting-reconciliation.policy';
import {
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
} from './accounting-provider-financial.parser';

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const safeInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

function payoutControls(value: unknown): UberReportingPayoutControl[] | null {
  if (!Array.isArray(value)) return null;
  const controls: UberReportingPayoutControl[] = [];
  for (const item of value) {
    const row = jsonRecord(item);
    const payoutReferenceId =
      typeof row.payoutReferenceId === 'string'
        ? row.payoutReferenceId.trim()
        : '';
    const totalPayoutCents = safeInteger(row.totalPayoutCents);
    const rowCount = safeInteger(row.rowCount);
    if (
      !payoutReferenceId ||
      totalPayoutCents == null ||
      rowCount == null ||
      rowCount < 1
    ) {
      return null;
    }
    controls.push({ payoutReferenceId, totalPayoutCents, rowCount });
  }
  return controls;
}

function evidenceKind(value: unknown): UberAccountingReportEvidenceKind | null {
  return value === UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS ||
    value === UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY
    ? value
    : null;
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

@Injectable()
export class AccountingUberReportingReconciliationService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async reconcileReportPair(input: {
    paymentDetailsReportStableId: string;
    payoutSummaryReportStableId: string;
    periodStart: string;
    periodEnd: string;
  }) {
    const paymentDetails = await this.readEvidence(
      input.paymentDetailsReportStableId,
    );
    const payoutSummaries = await this.readEvidence(
      input.payoutSummaryReportStableId,
    );

    const result = reconcileUberReportingEvidence({
      paymentDetails,
      payoutSummaries,
    });
    const periodMatchesRequest =
      result.periodStart === input.periodStart &&
      result.periodEnd === input.periodEnd;
    if (!periodMatchesRequest) {
      return {
        ...result,
        status: 'INCOMPLETE' as const,
        issues: [
          ...new Set([...result.issues, 'REQUEST_PERIOD_MISMATCH']),
        ].sort(),
      };
    }
    return result;
  }

  private async readEvidence(
    reportStableId: string,
  ): Promise<UberReportingReconciliationEvidence[]> {
    const stableId = reportStableId.trim();
    if (!stableId) return [];
    const rows =
      await this.prisma.accountingProviderFinancialDocument.findMany({
        where: {
          provider: AccountingFinancialProvider.UBER_EATS,
          documentType: AccountingFinancialDocumentType.API_REPORT,
          providerDocumentRef: { startsWith: `${stableId}:` },
        },
        select: {
          documentStableId: true,
          periodStart: true,
          periodEnd: true,
          currency: true,
          parserName: true,
          parserVersion: true,
          rawMetadata: true,
          artifact: {
            select: {
              parseRuns: {
                where: {
                  parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
                  parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
                  status: AccountingParseStatus.SUCCESS,
                },
                select: { resultJson: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { providerDocumentRef: 'asc' },
      });

    return rows.map((row) => {
      const currentParseResult = jsonRecord(
        row.artifact.parseRuns[0]?.resultJson,
      );
      const parsedMetadata = jsonRecord(currentParseResult.rawMetadata);
      const documentMetadata =
        row.parserName === ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME &&
        row.parserVersion === ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION
          ? jsonRecord(row.rawMetadata)
          : {};
      const metadata =
        Object.keys(parsedMetadata).length > 0
          ? parsedMetadata
          : documentMetadata;
      const kind = evidenceKind(metadata.evidenceKind);
      const controls = payoutControls(metadata.payoutControls);
      const columnTotals = jsonRecord(metadata.columnTotalsCents);
      const reportTotalPayoutCents = safeInteger(columnTotals['Total payout']);
      const unreferencedPayoutRowCount = safeInteger(
        metadata.unreferencedPayoutRowCount,
      );
      const unreferencedTotalPayoutCents = safeInteger(
        metadata.unreferencedTotalPayoutCents,
      );
      return {
        documentStableId: row.documentStableId,
        periodStart: dateOnly(row.periodStart) ?? '',
        periodEnd: dateOnly(row.periodEnd) ?? '',
        currency: row.currency,
        reportTotalPayoutCents: reportTotalPayoutCents ?? Number.NaN,
        payoutControls: controls ?? [],
        unreferencedPayoutRowCount:
          unreferencedPayoutRowCount ?? Number.NaN,
        unreferencedTotalPayoutCents:
          unreferencedTotalPayoutCents ?? Number.NaN,
        evidenceKind: kind ?? 'INVALID_EVIDENCE_KIND',
      };
    });
  }
}
