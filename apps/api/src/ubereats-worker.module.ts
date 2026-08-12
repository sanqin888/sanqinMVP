import { Module } from '@nestjs/common';
import { UberEatsWorkerEntryModule } from './integrations/ubereats/worker';

/** Production root for the controller-free Uber Eats worker process. */
@Module({
  imports: [UberEatsWorkerEntryModule],
})
export class UberEatsWorkerModule {}
