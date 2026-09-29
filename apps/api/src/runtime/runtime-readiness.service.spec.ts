import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { PrismaService } from '../prisma/prisma.service';
import { RuntimeReadinessService } from './runtime-readiness.service';

describe('RuntimeReadinessService', () => {
  const originalUploadRoot = process.env.UPLOAD_ROOT;
  let uploadRoot: string;

  beforeEach(() => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanq-readiness-'));
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (originalUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = originalUploadRoot;
  });

  const service = (query: jest.Mock) =>
    new RuntimeReadinessService({
      $queryRaw: query,
    } as unknown as PrismaService);

  it('reports ready when PostgreSQL responds and uploads are accessible', async () => {
    const query = jest.fn().mockResolvedValue([{ inRecovery: false }]);

    await expect(service(query).readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: {
        database: 'ok',
        uploads: 'ok',
      },
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails readiness while PostgreSQL is in recovery mode', async () => {
    const query = jest.fn().mockResolvedValue([{ inRecovery: true }]);

    await expect(service(query).readiness()).resolves.toMatchObject({
      status: 'not_ready',
      checks: {
        database: 'failed',
        uploads: 'ok',
      },
    });
  });

  it('fails readiness without exposing database errors', async () => {
    const query = jest.fn().mockRejectedValue(new Error('credential detail'));

    const snapshot = await service(query).readiness();

    expect(snapshot).toMatchObject({
      status: 'not_ready',
      checks: {
        database: 'failed',
        uploads: 'ok',
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('credential detail');
  });

  it('fails readiness when the configured uploads root is unavailable', async () => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    const query = jest.fn().mockResolvedValue([{ inRecovery: false }]);

    await expect(service(query).readiness()).resolves.toMatchObject({
      status: 'not_ready',
      checks: {
        database: 'ok',
        uploads: 'failed',
      },
    });
  });

  it('keeps liveness dependency-free', () => {
    const query = jest.fn();
    const snapshot = service(query).liveness();

    expect(snapshot.status).toBe('ok');
    expect(typeof snapshot.timestamp).toBe('string');
    expect(query).not.toHaveBeenCalled();
  });
});
