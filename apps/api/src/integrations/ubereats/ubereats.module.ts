import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrdersModule } from '../../orders/orders.module';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { ClaimAndExecuteUberOrderActionsUseCase } from './application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from './application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ProcessUberWebhookInboxUseCase } from './application/orders/process-uber-webhook-inbox.use-case';
import { ExecuteUberOrderActionWorker } from './application/orders/uber-order.use-cases';
import {
  UBER_EATS_STARTUP_CONFIG,
  validateUberEatsStartupConfig,
} from './infrastructure/config/uber-eats-startup-config.validator';
import { createCommonWiring } from './infrastructure/nest/common.wiring';
import { createMenuWiring } from './infrastructure/nest/menu.wiring';
import { createMerchantWiring } from './infrastructure/nest/merchant.wiring';
import { createOperationsWiring } from './infrastructure/nest/operations.wiring';
import { createOrdersWiring } from './infrastructure/nest/orders.wiring';
import { UberWorkerConfigService } from './infrastructure/workers/uber-worker-config.service';
import {
  UBER_EATS_MENU_AVAILABILITY,
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
  UBER_EATS_STORE_STATUS_SYNC,
} from './public-api';

/** The complete provider graph assembled exclusively by this composition root. */
const UBER_EATS_COMPOSITION_PROVIDERS: Provider[] = [
  {
    provide: UBER_EATS_STARTUP_CONFIG,
    useFactory: () => validateUberEatsStartupConfig(process.env),
  },
  ...createCommonWiring(),
  ...createMerchantWiring(),
  ...createMenuWiring(),
  ...createOrdersWiring(),
  ...createOperationsWiring(),
  {
    provide: ClaimAndProcessUberWebhookInboxUseCase,
    inject: [ProcessUberWebhookInboxUseCase],
    useFactory: (inbox: ProcessUberWebhookInboxUseCase) =>
      new ClaimAndProcessUberWebhookInboxUseCase(inbox),
  },
  {
    provide: ClaimAndExecuteUberOrderActionsUseCase,
    inject: [ExecuteUberOrderActionWorker],
    useFactory: (actions: ExecuteUberOrderActionWorker) =>
      new ClaimAndExecuteUberOrderActionsUseCase(actions),
  },
];

/**
 * Private worker runtime view of the same Uber Eats composition root.
 *
 * The dedicated process intentionally gets no HTTP controllers, AuthModule,
 * OrdersModule or MessagingModule. Cross-context implementation bridges are
 * assembled here so the process bootstrap never reaches through module
 * boundaries to Prisma or order internals.
 */
@Module({})
class UberEatsWorkerRuntimeCompositionModule {}

export function createUberEatsWorkerRuntimeModule(
  workerProviders: readonly Provider[],
): DynamicModule {
  return {
    module: UberEatsWorkerRuntimeCompositionModule,
    imports: [PrismaModule],
    providers: [
      OrderEventsBus,
      OrderIngestionService,
      ...UBER_EATS_COMPOSITION_PROVIDERS,
      ...workerProviders,
    ],
  };
}

/**
 * The sole Uber Eats Nest composition root. Public business capabilities are
 * explicit; worker dependencies remain exported only for the dedicated runtime.
 */
@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
  providers: UBER_EATS_COMPOSITION_PROVIDERS,
  exports: [
    UBER_EATS_MENU_AVAILABILITY,
    UBER_EATS_ORDER_ACTIONS,
    UBER_EATS_ORDER_STATUS_SYNC,
    UBER_EATS_STORE_STATUS_SYNC,
    ClaimAndProcessUberWebhookInboxUseCase,
    ClaimAndExecuteUberOrderActionsUseCase,
    UberWorkerConfigService,
  ],
})
export class UberEatsModule {}
