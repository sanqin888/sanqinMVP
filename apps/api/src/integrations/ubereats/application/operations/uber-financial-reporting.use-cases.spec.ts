import {
  HandleUberFinancialReportSuccessUseCase,
  UberFinancialReportingUseCase,
} from './uber-financial-reporting.use-cases';

describe('HandleUberFinancialReportSuccessUseCase replay safety', () => {
  it('replays after artifact download succeeded but report READY persistence failed', async () => {
    const requested = {
      status: 'REQUESTED',
      artifactUrls: [],
    };
    const reports = {
      findByWorkflowId: jest
        .fn()
        .mockResolvedValueOnce(requested)
        .mockResolvedValueOnce({ status: 'ERROR', artifactUrls: [] }),
      markReady: jest
        .fn()
        .mockRejectedValueOnce(new Error('simulated markReady failure'))
        .mockResolvedValueOnce({}),
      markError: jest.fn().mockResolvedValue(undefined),
    };
    const artifacts = {
      downloadCsvSections: jest
        .fn()
        .mockResolvedValue([
          '/api/v1/accounting/files/uber-reports/stable.csv',
        ]),
    };
    const useCase = new HandleUberFinancialReportSuccessUseCase(
      reports as never,
      artifacts as never,
    );
    const payload = {
      event_type: 'eats.report.success',
      job_id: 'workflow-123',
      report_metadata: {
        sections: [
          {
            download_url: 'https://reports.example.test/payment-details.csv',
            section_id: 'payment-details',
          },
        ],
      },
    };

    await expect(useCase.execute(payload)).rejects.toThrow(
      'simulated markReady failure',
    );
    await expect(useCase.execute(payload)).resolves.toBeUndefined();

    expect(artifacts.downloadCsvSections).toHaveBeenCalledTimes(2);
    expect(reports.markReady).toHaveBeenCalledTimes(2);
    const readyCalls = reports.markReady.mock.calls as unknown as Array<
      [
        {
          workflowId: string;
          artifactUrls: string[];
          downloadUrls: string[];
        },
      ]
    >;
    expect(readyCalls[0][0].artifactUrls).toEqual([
      '/api/v1/accounting/files/uber-reports/stable.csv',
    ]);
    expect(readyCalls[1][0].artifactUrls).toEqual(
      readyCalls[0][0].artifactUrls,
    );
    expect(reports.markError).toHaveBeenCalledWith({
      workflowId: 'workflow-123',
      errorMessage: 'simulated markReady failure',
    });
  });

  it('does not redownload a report already persisted as READY with artifacts', async () => {
    const reports = {
      findByWorkflowId: jest.fn().mockResolvedValue({
        status: 'READY',
        artifactUrls: ['/api/v1/accounting/files/uber-reports/stable.csv'],
      }),
    };
    const artifacts = { downloadCsvSections: jest.fn() };
    const useCase = new HandleUberFinancialReportSuccessUseCase(
      reports as never,
      artifacts as never,
    );

    await expect(
      useCase.execute({
        event_type: 'eats.report.success',
        job_id: 'workflow-123',
      }),
    ).resolves.toBeUndefined();

    expect(artifacts.downloadCsvSections).not.toHaveBeenCalled();
  });
});

describe('UberFinancialReportingUseCase request ownership', () => {
  function makeRequestUseCase(input?: {
    reportingEnabled?: boolean;
    mappings?: Array<{ uberStoreId: string; isProvisioned: boolean }>;
  }) {
    const api = {
      createReport: jest.fn().mockResolvedValue({ workflowId: 'workflow-1' }),
    };
    const reports = {
      findExisting: jest.fn().mockResolvedValue(null),
      saveRequested: jest.fn().mockResolvedValue({
        reportStableId: 'uberreport_1',
        workflowId: 'workflow-1',
        status: 'REQUESTED',
      }),
    };
    const artifacts = {};
    const storeMappings = {
      listMappings: jest.fn().mockResolvedValue(input?.mappings ?? []),
    };
    return {
      useCase: new UberFinancialReportingUseCase(
        api as never,
        reports as never,
        artifacts as never,
        storeMappings as never,
        input?.reportingEnabled ?? true,
      ),
      api,
      reports,
      storeMappings,
    };
  }

  it('keeps the eats.report capability gate inside External Channels', async () => {
    const { useCase, api, reports, storeMappings } = makeRequestUseCase({
      reportingEnabled: false,
      mappings: [{ uberStoreId: 'provider-store-a', isProvisioned: true }],
    });

    await expect(
      useCase.requestFinancialReports({
        startDate: '2026-09-09',
        endDate: '2026-09-10',
      }),
    ).resolves.toEqual([]);

    expect(storeMappings.listMappings).not.toHaveBeenCalled();
    expect(reports.findExisting).not.toHaveBeenCalled();
    expect(api.createReport).not.toHaveBeenCalled();
  });

  it('resolves provisioned provider store identities internally before requesting a report', async () => {
    const { useCase, api, reports, storeMappings } = makeRequestUseCase({
      mappings: [
        { uberStoreId: 'provider-store-b', isProvisioned: true },
        { uberStoreId: 'provider-store-disabled', isProvisioned: false },
        { uberStoreId: ' provider-store-a ', isProvisioned: true },
        { uberStoreId: 'provider-store-b', isProvisioned: true },
      ],
    });

    await expect(
      useCase.requestFinancialReports({
        startDate: '2026-09-09',
        endDate: '2026-09-10',
        reportTypes: ['FINANCE_SUMMARY_REPORT'],
      }),
    ).resolves.toEqual([
      {
        reportStableId: 'uberreport_1',
        workflowId: 'workflow-1',
        reportType: 'FINANCE_SUMMARY_REPORT',
        status: 'REQUESTED',
      },
    ]);

    expect(storeMappings.listMappings).toHaveBeenCalledTimes(1);
    expect(reports.findExisting).toHaveBeenCalledWith({
      reportType: 'FINANCE_SUMMARY_REPORT',
      storeUuids: ['provider-store-a', 'provider-store-b'],
      startDate: '2026-09-09',
      endDate: '2026-09-10',
    });
    expect(api.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'FINANCE_SUMMARY_REPORT',
        storeUuids: ['provider-store-a', 'provider-store-b'],
        startDate: '2026-09-09',
        endDate: '2026-09-10',
      }),
    );
  });

  it('does not request provider reports when there are no provisioned mappings', async () => {
    const { useCase, api, reports } = makeRequestUseCase({
      mappings: [
        { uberStoreId: 'provider-store-disabled', isProvisioned: false },
      ],
    });

    await expect(
      useCase.requestFinancialReports({
        startDate: '2026-09-09',
        endDate: '2026-09-10',
      }),
    ).resolves.toEqual([]);

    expect(reports.findExisting).not.toHaveBeenCalled();
    expect(api.createReport).not.toHaveBeenCalled();
  });
});

describe('UberFinancialReportingUseCase accounting artifact boundary', () => {
  const artifactUrl = '/api/v1/accounting/files/uber-reports/finance.csv';

  function makeUseCase(status: 'READY' | 'IMPORTED' | 'REQUESTED' = 'READY') {
    const api = { createReport: jest.fn() };
    const reports = {
      findByReportStableId: jest.fn().mockResolvedValue({
        reportStableId: 'uberreport_1',
        status,
        artifactUrls: [artifactUrl],
      }),
      markImported: jest.fn().mockResolvedValue({}),
    };
    const artifacts = {
      readCsvArtifact: jest.fn().mockResolvedValue({
        content: 'Metric,Amount\nMarketplace Fees,-12.34',
        contentHash: 'a'.repeat(64),
        byteSize: 36,
        fileName: 'finance.csv',
      }),
    };
    const storeMappings = { listMappings: jest.fn().mockResolvedValue([]) };
    return {
      useCase: new UberFinancialReportingUseCase(
        api as never,
        reports as never,
        artifacts as never,
        storeMappings as never,
        true,
      ),
      reports,
      artifacts,
    };
  }

  it('reads only an artifact owned by a READY report', async () => {
    const { useCase, artifacts } = makeUseCase();
    await expect(
      useCase.readFinancialReportArtifact({
        reportStableId: 'uberreport_1',
        artifactUrl,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ fileName: 'finance.csv' }) as unknown,
    );
    expect(artifacts.readCsvArtifact).toHaveBeenCalledWith(artifactUrl);
  });

  it('fails closed when the requested artifact does not belong to the report', async () => {
    const { useCase, artifacts } = makeUseCase();
    await expect(
      useCase.readFinancialReportArtifact({
        reportStableId: 'uberreport_1',
        artifactUrl: '/api/v1/accounting/files/uber-reports/other.csv',
      }),
    ).rejects.toThrow('artifact does not belong to report');
    expect(artifacts.readCsvArtifact).not.toHaveBeenCalled();
  });

  it('marks READY reports imported and treats IMPORTED as idempotent replay', async () => {
    const ready = makeUseCase('READY');
    await expect(
      ready.useCase.markFinancialReportImported('uberreport_1'),
    ).resolves.toBeUndefined();
    expect(ready.reports.markImported).toHaveBeenCalledWith('uberreport_1');

    const imported = makeUseCase('IMPORTED');
    await expect(
      imported.useCase.markFinancialReportImported('uberreport_1'),
    ).resolves.toBeUndefined();
    expect(imported.reports.markImported).not.toHaveBeenCalled();
  });
});
