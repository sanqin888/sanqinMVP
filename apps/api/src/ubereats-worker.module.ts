import { Module } from '@nestjs/common';
import { UberEatsInfrastructureWorkerModule } from './integrations/ubereats/worker';

/** Production root for the controller-free Uber Eats worker process. */
@Module({
  imports: [UberEatsInfrastructureWorkerModule],
})
export class UberEatsWorkerModule {}
