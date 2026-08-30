import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from '../store/public-api';
import { PosExchangeRateService } from './pos-exchange-rate.service';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [PosExchangeRateService],
  exports: [PosExchangeRateService],
})
export class PosExchangeRateModule {}
