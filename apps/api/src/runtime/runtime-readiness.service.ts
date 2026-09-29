import { constants as fsConstants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type RuntimeDependencyStatus = 'ok' | 'failed';

export interface RuntimeLivenessSnapshot {
  readonly status: 'ok';
  readonly timestamp: string;
}

export interface RuntimeReadinessSnapshot {
  readonly status: 'ok' | 'not_ready';
  readonly timestamp: string;
  readonly checks: Readonly<{
    database: RuntimeDependencyStatus;
    uploads: RuntimeDependencyStatus;
  }>;
}

/**
 * Canonical API runtime health owner.
 *
 * Readiness intentionally covers only dependencies required for this API
 * process to safely serve normal SanQ requests. Provider reachability belongs
 * to capability-specific telemetry and must not eject the whole API from
 * traffic when an external service is temporarily unavailable.
 */
@Injectable()
export class RuntimeReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  liveness(): RuntimeLivenessSnapshot {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<RuntimeReadinessSnapshot> {
    const [database, uploads] = await Promise.all([
      this.probeDatabase(),
      this.probeUploads(),
    ]);

    return {
      status: database === 'ok' && uploads === 'ok' ? 'ok' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        uploads,
      },
    };
  }

  private async probeDatabase(): Promise<RuntimeDependencyStatus> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ inRecovery: boolean }>>`
        SELECT pg_is_in_recovery() AS "inRecovery"
      `;
      return rows[0]?.inRecovery === false ? 'ok' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private async probeUploads(): Promise<RuntimeDependencyStatus> {
    try {
      await fs.access(
        this.getUploadsRootDir(),
        fsConstants.R_OK | fsConstants.W_OK,
      );
      return 'ok';
    } catch {
      return 'failed';
    }
  }

  private getUploadsRootDir(): string {
    const configured =
      process.env.UPLOAD_ROOT?.trim() || process.env.UPLOADS_DIR?.trim();
    return configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'uploads');
  }
}
