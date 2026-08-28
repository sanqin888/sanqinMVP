import { createHash } from 'crypto';
import type {
  UberEatsFinancialReportType,
  UberEatsReportingPort,
} from '../../public-api';
import type {
  UberFinancialReportApiPort,
  UberFinancialReportArtifactStorePort,
  UberFinancialReportRepositoryPort,
  UberFinancialReportStatus,
} from './uber-financial-reporting.ports';

const DEFAULT_REPORT_TYPES: UberEatsFinancialReportType[] = [
  'PAYMENT_DETAILS_REPORT',
  'FINANCE_SUMMARY_REPORT',
  'ORDERS_AND_ITEMS_REPORT',
];

export class UberFinancialReportingUseCase implements UberEatsReportingPort {
  constructor(
    private readonly api: UberFinancialReportApiPort,
    private readonly reports: UberFinancialReportRepositoryPort,
  ) {}

  async requestFinancialReports(input: {
    storeUuids: string[];
    startDate: string;
    endDate: string;
    reportTypes?: UberEatsFinancialReportType[];
  }) {
    const storeUuids = Array.from(
      new Set(input.storeUuids.map((value) => value.trim()).filter(Boolean)),
    ).sort();
    if (!storeUuids.length) return [];
    const reportTypes = input.reportTypes?.length
      ? Array.from(new Set(input.reportTypes))
      : DEFAULT_REPORT_TYPES;
    const results = [];
    for (const reportType of reportTypes) {
      const existing = await this.reports.findExisting({
        reportType,
        storeUuids,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      if (existing && existing.status !== 'ERROR') {
        results.push({
          reportStableId: existing.reportStableId,
          workflowId: existing.workflowId,
          reportType,
          status: existing.status,
        });
        continue;
      }
      const idempotencyKey = this.idempotencyKey({
        reportType,
        storeUuids,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      const response = await this.api.createReport({
        reportType,
        storeUuids,
        startDate: input.startDate,
        endDate: input.endDate,
        idempotencyKey,
      });
      const saved = await this.reports.saveRequested({
        workflowId: response.workflowId,
        reportType,
        storeUuids,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      results.push({
        reportStableId: saved.reportStableId,
        workflowId: saved.workflowId,
        reportType,
        status: saved.status,
      });
    }
    return results;
  }

  async listFinancialReports(input?: {
    limit?: number;
    status?: UberFinancialReportStatus;
  }) {
    const rows = await this.reports.list(input);
    return rows.map((row) => ({
      reportStableId: row.reportStableId,
      workflowId: row.workflowId,
      reportType: row.reportType,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      artifactUrls: row.artifactUrls,
      requestedAt: row.requestedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
    }));
  }

  private idempotencyKey(input: {
    reportType: string;
    storeUuids: string[];
    startDate: string;
    endDate: string;
  }) {
    const digest = createHash('sha256')
      .update(
        `${input.reportType}|${input.storeUuids.join(',')}|${input.startDate}|${input.endDate}`,
      )
      .digest('hex')
      .slice(0, 32);
    return `uber-report:${digest}`;
  }
}

export class HandleUberFinancialReportSuccessUseCase {
  constructor(
    private readonly reports: UberFinancialReportRepositoryPort,
    private readonly artifacts: UberFinancialReportArtifactStorePort,
  ) {}

  async execute(payload: unknown): Promise<void> {
    const root = this.object(payload);
    const eventType = this.text(root?.event_type);
    const workflowId = this.text(root?.job_id);
    if (eventType !== 'eats.report.success' || !workflowId) {
      throw new Error('Invalid Uber report success webhook');
    }
    const existing = await this.reports.findByWorkflowId(workflowId);
    if (
      existing &&
      (existing.status === 'READY' || existing.status === 'IMPORTED') &&
      existing.artifactUrls.length > 0
    ) {
      return;
    }

    const metadata = this.object(root?.report_metadata);
    const rawSections = Array.isArray(metadata?.sections) ? metadata.sections : [];
    const sections = rawSections
      .map((value) => {
        const section = this.object(value);
        const downloadUrl = this.text(section?.download_url);
        if (!downloadUrl) return null;
        return {
          downloadUrl,
          sectionId: this.text(section?.section_id),
        };
      })
      .filter(
        (value): value is { downloadUrl: string; sectionId: string | null } =>
          value !== null,
      );
    if (!sections.length) {
      await this.reports.markError({
        workflowId,
        errorMessage: 'Uber report success webhook contained no downloadable sections',
      });
      throw new Error('Uber report success webhook has no sections');
    }

    try {
      const artifactUrls = await this.artifacts.downloadCsvSections({
        workflowId,
        sections,
      });
      await this.reports.markReady({
        workflowId,
        downloadUrls: sections.map((section) => section.downloadUrl),
        artifactUrls,
        rawMetadata: payload,
      });
    } catch (error) {
      await this.reports.markError({
        workflowId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
