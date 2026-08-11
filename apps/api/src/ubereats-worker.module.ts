import { Module } from '@nestjs/common';

import { UberEatsModule } from './integrations/ubereats/ubereats.module';

/** Production root for the controller-free Uber Eats worker process. */
@Module({
  imports: [UberEatsModule.withWorkers()],
})
export class UberEatsWorkerModule {}
