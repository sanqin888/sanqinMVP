import { Module } from '@nestjs/common';
import { UberEatsApplicationModule } from '../ubereats-application.module';

@Module({
  imports: [UberEatsApplicationModule],
  exports: [UberEatsApplicationModule],
})
export class UberEatsOperationsModule {}
