import { Module } from '@nestjs/common';
import { UberEatsModule } from './integrations/ubereats/ubereats.module';
import {
  UBER_EATS_WORKER_PROVIDERS,
  UberWorkerHealthService,
} from './integrations/ubereats/worker';

/** Production Nest host for the dedicated Uber Eats worker process. */
@Module({
  imports: [UberEatsModule],
  providers: UBER_EATS_WORKER_PROVIDERS,
  exports: [UberWorkerHealthService],
})
export class UberEatsWorkerModule {}
