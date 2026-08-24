import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosExchangeRateService } from './pos-exchange-rate.service';

@Module({
  imports: [PrismaModule],
  providers: [PosExchangeRateService],
  exports: [PosExchangeRateService],
})
export class PosExchangeRateModule {}
