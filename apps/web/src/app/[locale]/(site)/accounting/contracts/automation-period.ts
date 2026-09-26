export type AccountingAutomationSettings = {
  timezone: string;
  runHour: number;
  runMinute: number;
  gmailEnabled: boolean;
  uberReportsEnabled: boolean;
  accountingStartDate: string | null;
  nextRunAt: string | null;
};

export type AccountingAutomationRunResult = {
  gmail: {
    configured: boolean;
    disabled?: boolean;
    scannedMessages: number;
    importedDocuments: number;
    duplicateDocuments: number;
    failedDocuments: number;
    skippedBeforeStartDate: number;
  };
  uber: unknown[];
  uberFinancialHistory: {
    scannedReports: number;
    importedReports: number;
    importedArtifacts: number;
    deferredArtifacts: number;
    skippedBeforeStartDate: number;
    skippedOrderDetailReports: number;
  };
};

export type AccountingUberFinancialReportType =
  | 'PAYMENT_DETAILS_REPORT'
  | 'FINANCE_SUMMARY_REPORT';

export type AccountingUberFinancialReportRequest = {
  startDate: string;
  endDate: string;
  reportTypes: AccountingUberFinancialReportType[];
};

export type AccountingUberFinancialReportRequestResult = {
  reportStableId: string;
  workflowId: string;
  reportType: AccountingUberFinancialReportType;
  status: 'REQUESTED' | 'READY' | 'IMPORTED' | 'ERROR';
};

export type AccountingUberFinancialReport = {
  reportStableId: string;
  workflowId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  status: 'REQUESTED' | 'READY' | 'IMPORTED' | 'ERROR';
  artifactUrls: string[];
  requestedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

export type AccountingPeriodClose = {
  periodType: 'MONTH' | 'YEAR';
  periodKey: string;
  startAt: string;
  endAt: string;
  closedByUserStableId: string;
  closedAt: string;
};
