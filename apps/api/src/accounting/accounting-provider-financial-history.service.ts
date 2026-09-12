import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountingFinancialProvider } from '@prisma/client';
import {
  UBER_EATS_REPORTING,
  type UberEatsReportingPort,
} from '../integrations/ubereats/public-api';
import { PROVIDER_FINANCIAL_HISTORY_START_DATE } from './accounting-inbox-core.policy';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';

@Injectable()
export class AccountingProviderFinancialHistoryService {
  private readonly logger = new Logger(
    AccountingProviderFinancialHistoryService.name,
  );

  constructor(
    private readonly acquisition: AccountingInboxAcquisitionService,
    @Inject(UBER_EATS_REPORTING)
    private readonly uberReporting: UberEatsReportingPort,
  ) {}

  async syncReadyUberReports(accountingStartDate: string | null) {
    const effectiveStartDate = laterDate(
      accountingStartDate,
      PROVIDER_FINANCIAL_HISTORY_START_DATE,
    );
    const reports = await this.uberReporting.listFinancialReports({
      status: 'READY',
      limit: 200,
    });
    const result = {
      scannedReports: 0,
      importedReports: 0,
      importedArtifacts: 0,
      deferredArtifacts: 0,
      skippedBeforeStartDate: 0,
      skippedOrderDetailReports: 0,
    };

    for (const report of reports) {
      if (report.reportType === 'ORDERS_AND_ITEMS_REPORT') {
        result.skippedOrderDetailReports += 1;
        continue;
      }
      if (report.endDate < effectiveStartDate) {
        result.skippedBeforeStartDate += 1;
        continue;
      }
      if (!report.artifactUrls.length) continue;
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
            periodStart: report.startDate,
            periodEnd: report.endDate,
            providerDocumentRef: `${report.reportStableId}:${index + 1}`,
            metadataJson: {
              uberReportStableId: report.reportStableId,
              uberWorkflowId: report.workflowId,
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
