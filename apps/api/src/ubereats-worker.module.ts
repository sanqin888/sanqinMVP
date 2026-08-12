import { Module } from '@nestjs/common';
import { UberEatsInfrastructureWorkerModule } from './integrations/ubereats/infrastructure/workers/ubereats-worker.module';

/** Production root for the controller-free Uber Eats worker process. */
@Module({
  imports: [UberEatsInfrastructureWorkerModule],
})
export class UberEatsWorkerModule {}
