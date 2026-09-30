import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountingFinancialProvider } from './accounting-contracts';
import {
  UBER_EATS_REPORTING,
  type UberEatsFinancialReportView,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';
import { PROVIDER_FINANCIAL_HISTORY_START_DATE } from './accounting-inbox-core.policy';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
import { AccountingUberReportingReconciliationService } from './accounting-uber-reporting-reconciliation.service';

type UberFinancialHistorySyncResult = {
  scannedReports: number;
  importedReports: number;
  importedArtifacts: number;
  deferredArtifacts: number;
  skippedBeforeStartDate: number;
  skippedOrderDetailReports: number;
  reconciledReportPairs: number;
  deferredReconciliationGroups: number;
};

@Injectable()
export class AccountingProviderFinancialHistoryService {
  private readonly logger = new Logger(
    AccountingProviderFinancialHistoryService.name,
  );

  constructor(
    private readonly acquisition: AccountingInboxAcquisitionService,
    @Inject(UBER_EATS_REPORTING)
    private readonly uberReporting: UberEatsReportingPort,
    private readonly uberReconciliation: AccountingUberReportingReconciliationService,
  ) {}

  async syncReadyUberReports(accountingStartDate: string | null) {
    const result: UberFinancialHistorySyncResult = {
      scannedReports: 0,
      importedReports: 0,
      importedArtifacts: 0,
      deferredArtifacts: 0,
      skippedBeforeStartDate: 0,
      skippedOrderDetailReports: 0,
      reconciledReportPairs: 0,
      deferredReconciliationGroups: 0,
    };
    if (!this.uberReporting.isFinancialAuthorityEnabled()) return result;

    const effectiveStartDate = laterDate(
      accountingStartDate,
      PROVIDER_FINANCIAL_HISTORY_START_DATE,
    );
    const readyReports = await this.uberReporting.listFinancialReports({
      status: 'READY',
      limit: 200,
    });
    const materializationResults = new Map<string, boolean>();
    const processedCandidateGroups = new Set<string>();

    for (const readyReport of readyReports) {
      if (readyReport.reportType === 'ORDERS_AND_ITEMS_REPORT') {
        result.skippedOrderDetailReports += 1;
        continue;
      }
      if (readyReport.endDate < effectiveStartDate) {
        result.skippedBeforeStartDate += 1;
        continue;
      }

      await this.ensureReportMaterialized(
        readyReport,
        effectiveStartDate,
        result,
        materializationResults,
      );

      const candidates =
        await this.uberReporting.findFinancialReportReconciliationCandidates({
          anchorReportStableId: readyReport.reportStableId,
        });
      const candidateGroupKey = candidates
        .map((report) => report.reportStableId)
        .sort()
        .join('|');
      if (
        candidateGroupKey &&
        processedCandidateGroups.has(candidateGroupKey)
      ) {
        continue;
      }
      if (candidateGroupKey) {
        processedCandidateGroups.add(candidateGroupKey);
      }

      const paymentDetails = candidates.filter(
        (report) => report.reportType === 'PAYMENT_DETAILS_REPORT',
      );
      const payoutSummaries = candidates.filter(
        (report) => report.reportType === 'FINANCE_SUMMARY_REPORT',
      );
      if (paymentDetails.length !== 1 || payoutSummaries.length !== 1) {
        result.deferredReconciliationGroups += 1;
        continue;
      }

      const payment = paymentDetails[0];
      const payout = payoutSummaries[0];
      if (
        payment.startDate !== readyReport.startDate ||
        payment.endDate !== readyReport.endDate ||
        payout.startDate !== readyReport.startDate ||
        payout.endDate !== readyReport.endDate
      ) {
        result.deferredReconciliationGroups += 1;
        continue;
      }

      const paymentMaterialized = await this.ensureReportMaterialized(
        payment,
        effectiveStartDate,
        result,
        materializationResults,
      );
      const payoutMaterialized = await this.ensureReportMaterialized(
        payout,
        effectiveStartDate,
        result,
        materializationResults,
      );
      if (!paymentMaterialized || !payoutMaterialized) {
        result.deferredReconciliationGroups += 1;
        continue;
      }

      const reconciliation = await this.uberReconciliation.reconcileReportPair({
        paymentDetailsReportStableId: payment.reportStableId,
        payoutSummaryReportStableId: payout.reportStableId,
        periodStart: payment.startDate,
        periodEnd: payment.endDate,
      });
      if (reconciliation.status !== 'MATCHED') {
        result.deferredReconciliationGroups += 1;
        this.logger.warn(
          `Uber financial report reconciliation deferred for ${payment.startDate}..${payment.endDate}: ${reconciliation.issues.join(
            ',',
          )}`,
        );
        continue;
      }

      result.reconciledReportPairs += 1;
      for (const report of [payment, payout]) {
        if (report.status !== 'READY') continue;
        await this.uberReporting.markFinancialReportImported(
          report.reportStableId,
        );
        result.importedReports += 1;
      }
    }

    return result;
  }

  private async ensureReportMaterialized(
    report: UberEatsFinancialReportView,
    effectiveStartDate: string,
    result: UberFinancialHistorySyncResult,
    materializationResults: Map<string, boolean>,
  ): Promise<boolean> {
    if (report.status === 'IMPORTED') return true;

    const cached = materializationResults.get(report.reportStableId);
    if (cached != null) return cached;
    if (!report.artifactUrls.length) {
      materializationResults.set(report.reportStableId, false);
      return false;
    }

    result.scannedReports += 1;
    let allMaterialized = true;
    for (let index = 0; index < report.artifactUrls.length; index += 1) {
      const artifactUrl = report.artifactUrls[index];
      try {
        const artifact = await this.uberReporting.readFinancialReportArtifact({
          reportStableId: report.reportStableId,
          artifactUrl,
        });
        const acquired = await this.acquisition.acquireProviderApiCsv({
          transportIdentity: `uber-report:${report.reportStableId}:${artifactUrl}`,
          fileName: artifact.fileName,
          content: artifact.content,
          provider: AccountingFinancialProvider.UBER_EATS,
          reportType: report.reportType,
          providerReportType: report.providerReportType,
          periodStart: report.startDate,
          periodEnd: report.endDate,
          providerDocumentRef: `${report.reportStableId}:${index + 1}`,
          metadataJson: {
            uberReportStableId: report.reportStableId,
            uberWorkflowId: report.workflowId,
            uberProviderReportType: report.providerReportType,
            uberArtifactUrl: artifactUrl,
            providerContentHash: artifact.contentHash,
            providerByteSize: artifact.byteSize,
            accountingStartDate: effectiveStartDate,
            crossesAccountingStartBoundary:
              report.startDate < effectiveStartDate &&
              report.endDate >= effectiveStartDate,
          },
        });
        if (acquired.providerFinancialMatched) {
          result.importedArtifacts += 1;
        } else {
          allMaterialized = false;
          result.deferredArtifacts += 1;
        }
      } catch (error) {
        allMaterialized = false;
        result.deferredArtifacts += 1;
        this.logger.warn(
          `Uber financial artifact import deferred for ${report.reportStableId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    materializationResults.set(report.reportStableId, allMaterialized);
    return allMaterialized;
  }
}

function laterDate(
  configuredStartDate: string | null,
  requiredStartDate: string,
): string {
  if (!configuredStartDate || configuredStartDate < requiredStartDate) {
    return requiredStartDate;
  }
  return configuredStartDate;
}
