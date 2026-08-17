import { Module } from '@nestjs/common';
import { UBER_EATS_COMPOSITION_PROVIDERS } from './integrations/ubereats/ubereats.module';
import {
  UBER_EATS_WORKER_PROVIDERS,
  UberWorkerHealthService,
} from './integrations/ubereats/worker';
import { OrderEventsBus } from './messaging/order-events.bus';
import { OrderIngestionService } from './orders/order-ingestion.service';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Production Nest host for the dedicated Uber Eats worker process.
 *
 * Keep this application context intentionally narrow. Importing the API-facing
 * Uber Eats or Orders feature modules pulls in Auth/Membership/Google OAuth and
 * other HTTP-process providers that a durable worker neither needs nor has
 * runtime configuration for. The worker reuses the Uber composition provider
 * declarations and registers only the cross-context order-ingestion bridge it
 * actually needs.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    OrderEventsBus,
    OrderIngestionService,
    ...UBER_EATS_COMPOSITION_PROVIDERS,
    ...UBER_EATS_WORKER_PROVIDERS,
  ],
  exports: [UberWorkerHealthService],
})
export class UberEatsWorkerModule {}
