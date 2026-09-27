import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountingFinancialProvider } from './accounting-contracts';
import {
  UBER_EATS_REPORTING,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';
import { PROVIDER_FINANCIAL_HISTORY_START_DATE } from './accounting-inbox-core.policy';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';
import { AccountingUberReportingReconciliationService } from './accounting-uber-reporting-reconciliation.service';

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
    const result = {
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
    const [readyReports, importedReports] = await Promise.all([
      this.uberReporting.listFinancialReports({
        status: 'READY',
        limit: 200,
      }),
      this.uberReporting.listFinancialReports({
        status: 'IMPORTED',
        limit: 200,
      }),
    ]);
    const pairingReports: typeof readyReports = [];
    const materializedReportStableIds = new Set(
      importedReports.map((report) => report.reportStableId),
    );

    for (const report of readyReports) {
      if (report.reportType === 'ORDERS_AND_ITEMS_REPORT') {
        result.skippedOrderDetailReports += 1;
        continue;
      }
      if (report.endDate < effectiveStartDate) {
        result.skippedBeforeStartDate += 1;
        continue;
      }
      pairingReports.push(report);
      if (!report.artifactUrls.length) continue;
      result.scannedReports += 1;

      let allMaterialized = true;
      for (let index = 0; index < report.artifactUrls.length; index += 1) {
        const artifactUrl = report.artifactUrls[index];
        try {
          const artifact = await this.uberReporting.readFinancialReportArtifact(
            {
              reportStableId: report.reportStableId,
              artifactUrl,
            },
          );
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

      if (allMaterialized) {
        materializedReportStableIds.add(report.reportStableId);
      }
    }

    for (const report of importedReports) {
      if (
        report.reportType !== 'ORDERS_AND_ITEMS_REPORT' &&
        report.endDate >= effectiveStartDate
      ) {
        pairingReports.push(report);
      }
    }

    const reportGroups = new Map<string, typeof pairingReports>();
    for (const report of pairingReports) {
      const key = `${report.startDate}|${report.endDate}`;
      const group = reportGroups.get(key) ?? [];
      group.push(report);
      reportGroups.set(key, group);
    }

    for (const group of reportGroups.values()) {
      if (!group.some((report) => report.status === 'READY')) continue;
      const paymentDetails = group.filter(
        (report) => report.reportType === 'PAYMENT_DETAILS_REPORT',
      );
      const payoutSummaries = group.filter(
        (report) => report.reportType === 'FINANCE_SUMMARY_REPORT',
      );
      if (paymentDetails.length !== 1 || payoutSummaries.length !== 1) {
        result.deferredReconciliationGroups += 1;
        continue;
      }

      const payment = paymentDetails[0];
      const payout = payoutSummaries[0];
      if (
        !materializedReportStableIds.has(payment.reportStableId) ||
        !materializedReportStableIds.has(payout.reportStableId)
      ) {
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
