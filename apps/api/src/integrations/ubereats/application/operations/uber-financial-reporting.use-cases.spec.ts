import { HandleUberFinancialReportSuccessUseCase } from './uber-financial-reporting.use-cases';

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
