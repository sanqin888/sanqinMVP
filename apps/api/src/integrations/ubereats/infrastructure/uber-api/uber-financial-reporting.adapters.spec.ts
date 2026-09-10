import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UberFinancialReportArtifactStore } from './uber-financial-reporting.adapters';

describe('UberFinancialReportArtifactStore replay safety', () => {
  let tempRoot: string;
  let previousUploadRoot: string | undefined;

  beforeEach(async () => {
    previousUploadRoot = process.env.UPLOAD_ROOT;
    tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sanq-uber-report-'),
    );
    process.env.UPLOAD_ROOT = tempRoot;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (previousUploadRoot == null) {
      delete process.env.UPLOAD_ROOT;
    } else {
      process.env.UPLOAD_ROOT = previousUploadRoot;
    }
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('reuses one deterministic artifact when the same section is replayed', async () => {
    const csv = 'order_id,total\n1,367\n';
    const bytes = new TextEncoder().encode(csv);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.byteLength) },
      }),
    );
    const store = new UberFinancialReportArtifactStore();
    const input = {
      workflowId: 'workflow-123',
      sections: [
        {
          downloadUrl: 'https://8.8.8.8/payment-details.csv',
          sectionId: 'payment-details',
        },
      ],
    };

    const first = await store.downloadCsvSections(input);
    const replay = await store.downloadCsvSections({
      ...input,
      sections: [
        {
          ...input.sections[0],
          downloadUrl:
            'https://8.8.8.8/payment-details.csv?signature=rotated-token',
        },
      ],
    });

    expect(replay).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const artifactDir = path.join(tempRoot, 'accounting', 'uber-reports');
    const files = await fs.promises.readdir(artifactDir);
    expect(files.filter((file) => file.endsWith('.csv'))).toHaveLength(1);
    expect(files.filter((file) => file.endsWith('.tmp'))).toHaveLength(0);
    await expect(
      fs.promises.readFile(
        path.join(artifactDir, path.basename(first[0])),
        'utf8',
      ),
    ).resolves.toBe(csv);
  });

  it('keeps a distinct artifact when the same logical section returns different content', async () => {
    const firstBytes = new TextEncoder().encode('order_id,total\n1,367\n');
    const secondBytes = new TextEncoder().encode('order_id,total\n1,400\n');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(firstBytes, { status: 200 }))
      .mockResolvedValueOnce(new Response(secondBytes, { status: 200 }));
    const store = new UberFinancialReportArtifactStore();
    const input = {
      workflowId: 'workflow-123',
      sections: [
        {
          downloadUrl: 'https://8.8.8.8/payment-details.csv',
          sectionId: 'payment-details',
        },
      ],
    };

    const first = await store.downloadCsvSections(input);
    const changed = await store.downloadCsvSections(input);

    expect(changed[0]).not.toBe(first[0]);
    const files = await fs.promises.readdir(
      path.join(tempRoot, 'accounting', 'uber-reports'),
    );
    expect(files.filter((file) => file.endsWith('.csv'))).toHaveLength(2);
  });

  it('fails closed when an existing deterministic artifact has different bytes', async () => {
    const csv = 'order_id,total\n1,367\n';
    const bytes = new TextEncoder().encode(csv);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(bytes, { status: 200 }));
    const store = new UberFinancialReportArtifactStore();
    const input = {
      workflowId: 'workflow-123',
      sections: [
        {
          downloadUrl: 'https://8.8.8.8/payment-details.csv',
          sectionId: 'payment-details',
        },
      ],
    };

    const [artifactUrl] = await store.downloadCsvSections(input);
    const artifactPath = path.join(
      tempRoot,
      'accounting',
      'uber-reports',
      path.basename(artifactUrl),
    );
    await fs.promises.writeFile(artifactPath, 'corrupt');

    await expect(store.downloadCsvSections(input)).rejects.toThrow(
      'Uber report artifact integrity mismatch',
    );
  });
});
