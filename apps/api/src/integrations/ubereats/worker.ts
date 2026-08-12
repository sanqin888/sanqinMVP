import { Module } from '@nestjs/common';
import { UberEatsWorkerLifecycleModule } from './infrastructure/workers/ubereats-worker.module';

/** Stable, controller-free startup entry for the dedicated worker process. */
@Module({ imports: [UberEatsWorkerLifecycleModule] })
export class UberEatsWorkerEntryModule {}

/** Stable health-check contract for worker process hosts. */
export { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';
