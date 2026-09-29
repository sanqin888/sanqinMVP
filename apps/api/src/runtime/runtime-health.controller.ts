import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { RuntimeReadinessService } from './runtime-readiness.service';

@Controller()
export class RuntimeHealthController {
  constructor(private readonly readiness: RuntimeReadinessService) {}

  /**
   * Process liveness only. This route deliberately does not touch PostgreSQL,
   * local storage, or any external provider.
   */
  @Get('live')
  live() {
    return this.readiness.liveness();
  }

  /**
   * Application readiness for real SanQ traffic.
   *
   * Keep this limited to dependencies owned by the local runtime. External
   * providers (Clover, Uber, messaging, AWS, Google) are capability telemetry,
   * not whole-API traffic-admission dependencies.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    return this.respondWithReadiness(response);
  }

  /**
   * Backward-compatible readiness alias for the existing CI/browser consumer.
   * R4 may move those consumers to /ready explicitly after the runtime contract
   * is established.
   */
  @Get('health')
  async health(@Res({ passthrough: true }) response: Response) {
    return this.respondWithReadiness(response);
  }

  private async respondWithReadiness(response: Response) {
    const snapshot = await this.readiness.readiness();
    response.status(
      snapshot.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return snapshot;
  }
}
