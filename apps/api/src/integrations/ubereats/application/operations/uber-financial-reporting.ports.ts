import type { UberEatsFinancialReportType } from '../../public-api';

export const UBER_FINANCIAL_REPORT_API = Symbol('UBER_FINANCIAL_REPORT_API');
export const UBER_FINANCIAL_REPORT_REPOSITORY = Symbol(
  'UBER_FINANCIAL_REPORT_REPOSITORY',
);
export const UBER_FINANCIAL_REPORT_ARTIFACT_STORE = Symbol(
  'UBER_FINANCIAL_REPORT_ARTIFACT_STORE',
);

export type UberFinancialReportStatus =
  | 'REQUESTED'
  | 'READY'
  | 'IMPORTED'
  | 'ERROR';

export type UberFinancialReportRecord = {
  reportStableId: string;
  workflowId: string;
  reportType: string;
  storeUuids: string[];
  startDate: string;
  endDate: string;
  status: UberFinancialReportStatus;
  downloadUrls: string[];
  artifactUrls: string[];
  requestedAt: Date;
  completedAt: Date | null;
  importedAt: Date | null;
  errorMessage: string | null;
};

export interface UberFinancialReportApiPort {
  createReport(input: {
    reportType: UberEatsFinancialReportType;
    storeUuids: string[];
    startDate: string;
    endDate: string;
    idempotencyKey: string;
  }): Promise<{ workflowId: string }>;
}

export interface UberFinancialReportRepositoryPort {
  findExisting(input: {
    reportType: UberEatsFinancialReportType;
    storeUuids: string[];
    startDate: string;
    endDate: string;
  }): Promise<UberFinancialReportRecord | null>;
  saveRequested(input: {
    workflowId: string;
    reportType: UberEatsFinancialReportType;
    storeUuids: string[];
    startDate: string;
    endDate: string;
  }): Promise<UberFinancialReportRecord>;
  markReady(input: {
    workflowId: string;
    downloadUrls: string[];
    artifactUrls: string[];
    rawMetadata: unknown;
  }): Promise<UberFinancialReportRecord>;
  markError(input: {
    workflowId: string;
    errorMessage: string;
  }): Promise<void>;
  list(input?: {
    limit?: number;
    status?: UberFinancialReportStatus;
  }): Promise<UberFinancialReportRecord[]>;
}

export interface UberFinancialReportArtifactStorePort {
  downloadCsvSections(input: {
    workflowId: string;
    sections: Array<{ downloadUrl: string; sectionId: string | null }>;
  }): Promise<string[]>;
}
