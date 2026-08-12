import { Module } from '@nestjs/common';
import { UberEatsApplicationModule } from '../composition/ubereats-application.module';

@Module({
  imports: [UberEatsApplicationModule],
  exports: [UberEatsApplicationModule],
})
export class UberEatsOrdersModule {}
