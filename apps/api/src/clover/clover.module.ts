import { Module } from '@nestjs/common';

import { CloverProviderInfrastructureModule } from '../payments/infrastructure/clover/clover-provider-infrastructure.module';
import { CloverController } from './clover.controller';
import { CloverService } from './clover.service';

@Module({
  imports: [CloverProviderInfrastructureModule],
  providers: [CloverService],
  controllers: [CloverController],
  exports: [CloverService],
})
export class CloverModule {}
