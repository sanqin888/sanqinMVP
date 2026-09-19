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

export type AccountingPeriodClose = {
  periodType: 'MONTH' | 'YEAR';
  periodKey: string;
  startAt: string;
  endAt: string;
  closedByUserStableId: string;
  closedAt: string;
};
