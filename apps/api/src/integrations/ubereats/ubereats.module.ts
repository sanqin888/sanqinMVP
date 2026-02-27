import { Module } from '@nestjs/common';
import { UberEatsController } from './ubereats.controller';

@Module({
  controllers: [UberEatsController],
})
export class UberEatsModule {}
