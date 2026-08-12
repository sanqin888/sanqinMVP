import { Module } from '@nestjs/common';
import { UberEatsHttpModule } from './modules/ubereats-http.module';
import {
  UBER_EATS_PUBLIC_PROVIDERS,
  UberEatsApplicationModule,
} from './ubereats-application.module';

/** HTTP composition root. Polling is enabled only by importing the worker module. */
@Module({
  imports: [UberEatsApplicationModule, UberEatsHttpModule],
  exports: UBER_EATS_PUBLIC_PROVIDERS,
})
export class UberEatsModule {}
