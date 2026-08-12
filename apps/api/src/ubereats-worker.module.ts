import { Module } from '@nestjs/common';
import { UberEatsInfrastructureWorkerModule as UberEatsPollingModule } from './integrations/ubereats/worker';

/** Production root for the controller-free Uber Eats infrastructure worker process. */
@Module({
  imports: [UberEatsPollingModule],
})
export class UberEatsWorkerModule {}
