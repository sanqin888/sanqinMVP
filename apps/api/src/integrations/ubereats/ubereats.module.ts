import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { ConfirmUberMenuPublicationUseCase } from './application/menu/confirm-uber-menu-publication.use-case';
import { ConfirmUberMenuPublicationsUseCase } from './application/menu/confirm-uber-menu-publications.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from './application/menu/recover-timed-out-menu-publications.use-case';
import { ClaimAndExecuteUberOrderActionsUseCase } from './application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from './application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ProcessUberWebhookInboxUseCase } from './application/orders/process-uber-webhook-inbox.use-case';
import { ExecuteUberOrderActionWorker } from './application/orders/uber-order.use-cases';
import { UBER_EATS_INFRASTRUCTURE_PROVIDERS } from './providers/infrastructure.providers';
import { UberWorkerConfigService } from './infrastructure/workers/uber-worker-config.service';
import {
  UBER_EATS_MENU_EXPORTS,
  UBER_EATS_MENU_PROVIDERS,
} from './providers/menu.providers';
import {
  UBER_EATS_MERCHANT_EXPORTS,
  UBER_EATS_MERCHANT_PROVIDERS,
} from './providers/merchant.providers';
import {
  UBER_EATS_OPERATIONS_EXPORTS,
  UBER_EATS_OPERATIONS_PROVIDERS,
} from './providers/operations.providers';
import {
  UBER_EATS_ORDER_EXPORTS,
  UBER_EATS_ORDER_PROVIDERS,
} from './providers/orders.providers';

/**
 * Process-neutral wiring shared by the HTTP and worker entry configurations.
 * Polling lifecycle adapters deliberately do not belong in this provider list.
 */
export const UBER_EATS_COMPOSITION_PROVIDERS = [
  ...UBER_EATS_INFRASTRUCTURE_PROVIDERS,
  ...UBER_EATS_MERCHANT_PROVIDERS,
  ...UBER_EATS_MENU_PROVIDERS,
  ...UBER_EATS_ORDER_PROVIDERS,
  ...UBER_EATS_OPERATIONS_PROVIDERS,
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
  {
    provide: ConfirmUberMenuPublicationsUseCase,
    inject: [
      ConfirmUberMenuPublicationUseCase,
      RecoverTimedOutMenuPublicationsUseCase,
    ],
    useFactory: (
      confirmations: ConfirmUberMenuPublicationUseCase,
      recovery: RecoverTimedOutMenuPublicationsUseCase,
    ) => new ConfirmUberMenuPublicationsUseCase(confirmations, recovery),
  },
];

export const UBER_EATS_COMPOSITION_EXPORTS = [
  ...UBER_EATS_MERCHANT_EXPORTS,
  ...UBER_EATS_MENU_EXPORTS,
  ...UBER_EATS_ORDER_EXPORTS,
  ...UBER_EATS_OPERATIONS_EXPORTS,
  ClaimAndProcessUberWebhookInboxUseCase,
  ClaimAndExecuteUberOrderActionsUseCase,
  ConfirmUberMenuPublicationsUseCase,
  UberWorkerConfigService,
];

/** The single controller-free Uber Eats adapter/port/use-case composition root. */
@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  providers: UBER_EATS_COMPOSITION_PROVIDERS,
  exports: UBER_EATS_COMPOSITION_EXPORTS,
})
export class UberEatsCompositionModule {}

/** HTTP entry configuration. Polling is enabled only by the worker entry. */
@Module({
  imports: [UberEatsCompositionModule],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
  exports: [UberEatsCompositionModule],
})
export class UberEatsModule {}
