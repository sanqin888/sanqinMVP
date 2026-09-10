import { Logger, Module, type DynamicModule, type Provider } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import {
  CATALOG_EXTERNAL_MENU_FACTS_READER,
  CatalogExternalMenuFactsModule,
  type CatalogExternalMenuFactsReaderPort,
} from '../../menu/public-api';
import {
  ORDER_EXTERNAL_CANCELLATION_FINALIZER,
  ORDER_EXTERNAL_FACTS_READER,
  ORDER_EXTERNAL_TRANSITION_COORDINATOR,
  ORDER_INGESTION_PROVIDER,
  OrderExternalCancellationModule,
  OrderExternalFactsModule,
  OrderExternalTransitionModule,
  OrdersModule,
  type OrderExternalCancellationFinalizerPort,
  type OrderExternalFactsReaderPort,
  type OrderExternalTransitionCoordinatorPort,
} from '../../orders/public-api';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  BRAND_STORE_CONFIG_READER,
  STORE_SCHEDULE_READER,
  BrandStoreConfigModule,
  BrandStoreConfigUnavailableError,
  type BrandStoreConfigReaderPort,
  type StoreScheduleReaderPort,
} from '../../store/public-api';
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
  UBER_BUSINESS_SCHEDULE_QUERY_PORT,
  type UberBusinessScheduleQueryPort,
} from './application/menu/uber-menu-draft.ports';
import {
  UBER_CANONICAL_ORDER_FACTS_QUERY,
  type UberCanonicalOrderFactsQueryPort,
} from './application/shared/uber-canonical-order-facts.port';
import {
  UBER_CANONICAL_ORDER_CANCELLATION,
  type UberCanonicalOrderCancellationPort,
} from './application/shared/uber-canonical-order-cancellation.port';
import {
  UBER_CATALOG_MENU_FACTS_QUERY,
  type UberCatalogMenuFactsQueryPort,
} from './application/shared/uber-catalog-menu-facts.port';
import {
  UBER_STORE_CONFIG_QUERY,
  type UberStoreConfigQueryPort,
} from './application/shared/uber-store-config.port';
import {
  type UberOrderSyncRepositoryPort,
  UBER_ORDER_SYNC_REPOSITORY,
} from './application/orders/uber-order-sync.ports';
import {
  type UberOrderActionRepositoryPort,
  UBER_ORDER_ACTION_REPOSITORY,
} from './application/orders/uber-order.ports';
import {
  type UberOrderOperationsRepositoryPort,
  UBER_ORDER_OPERATIONS_REPOSITORY,
} from './application/operations/uber-operations.ports';
import {
  UBER_EATS_STARTUP_CONFIG,
  validateUberEatsStartupConfig,
} from './infrastructure/config/uber-eats-startup-config.validator';
import { createCommonWiring } from './infrastructure/nest/common.wiring';
import { createMenuWiring } from './infrastructure/nest/menu.wiring';
import { createMerchantWiring } from './infrastructure/nest/merchant.wiring';
import { createOperationsWiring } from './infrastructure/nest/operations.wiring';
import { createOrdersWiring } from './infrastructure/nest/orders.wiring';
import { UberOrderActionPrismaAdapter } from './infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberWorkerConfigService } from './infrastructure/workers/uber-worker-config.service';
import {
  UBER_EATS_MENU_AVAILABILITY,
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
  UBER_EATS_REPORTING,
  UBER_EATS_STORE_STATUS_SYNC,
} from './public-api';

const UBER_ORDER_CANCELLATION_LOGGER = new Logger('UberOrderImportPrismaAdapter');

/** The complete provider graph assembled exclusively by this composition root. */
const UBER_EATS_COMPOSITION_PROVIDERS: Provider[] = [
  {
    provide: UBER_EATS_STARTUP_CONFIG,
    useFactory: () => validateUberEatsStartupConfig(process.env),
  },
  {
    provide: UBER_STORE_CONFIG_QUERY,
    inject: [BRAND_STORE_CONFIG_READER],
    useFactory: (
      reader: BrandStoreConfigReaderPort,
    ): UberStoreConfigQueryPort => {
      const readStorePolicy = async (storeStableId: string) => {
        try {
          return await reader.getStoreSnapshot(storeStableId);
        } catch (error) {
          if (error instanceof BrandStoreConfigUnavailableError) return null;
          throw error;
        }
      };

      return {
        getStoreConfig: async (storeStableId) => {
          const store = await reader.getStoreSnapshot(storeStableId);
          return {
            timezone: store.timezone,
            salesTaxRate: store.salesTaxRate,
            isTemporarilyClosed: store.isTemporarilyClosed,
            temporaryCloseReason: store.temporaryCloseReason,
          };
        },
        getStoreAllergyPolicy: async (storeStableId) => {
          const store = await readStorePolicy(storeStableId);
          return {
            mode: store?.allergyHandlingMode ?? 'RELAY_ALL',
            unsupportedAllergens: store?.unsupportedAllergens ?? [],
          };
        },
        getStoreAutoAcceptOnlineOrders: async (storeStableId) =>
          (await readStorePolicy(storeStableId))?.autoAcceptOnlineOrders ??
          true,
      };
    },
  },
  {
    provide: UBER_BUSINESS_SCHEDULE_QUERY_PORT,
    inject: [UBER_STORE_CONFIG_QUERY, STORE_SCHEDULE_READER],
    useFactory: (
      storeConfig: UberStoreConfigQueryPort,
      scheduleReader: StoreScheduleReaderPort,
    ): UberBusinessScheduleQueryPort => ({
      readBusinessSchedule: async (storeStableId) => {
        const [config, hours] = await Promise.all([
          storeConfig.getStoreConfig(storeStableId),
          scheduleReader.listBusinessHours(storeStableId),
        ]);
        return {
          timezone: config.timezone,
          salesTaxRate: config.salesTaxRate,
          hours,
        };
      },
    }),
  },
  {
    provide: UBER_CATALOG_MENU_FACTS_QUERY,
    inject: [CATALOG_EXTERNAL_MENU_FACTS_READER],
    useFactory: (
      reader: CatalogExternalMenuFactsReaderPort,
    ): UberCatalogMenuFactsQueryPort => ({
      readMenuSource: async () => {
        const source = await reader.readMenuSource();
        return {
          categories: source.categories,
          menuItems: source.items.map((item) => ({
            ...item,
            tempUnavailableUntil: item.tempUnavailableUntil
              ? new Date(item.tempUnavailableUntil)
              : null,
          })),
          modifierTemplates: source.modifierGroups.map((group) => ({
            ...group,
            options: group.options.map((option) => ({
              ...option,
              tempUnavailableUntil: option.tempUnavailableUntil
                ? new Date(option.tempUnavailableUntil)
                : null,
            })),
          })),
        };
      },
      getMenuItemSource: (stableId) => reader.getMenuItemSource(stableId),
      getOptionSource: (stableId) => reader.getOptionSource(stableId),
      getModifierGroupSource: (stableId) =>
        reader.getModifierGroupSource(stableId),
      listOrderModifierSnapshotSources: () =>
        reader.listOrderModifierSnapshotSources(),
    }),
  },
  {
    provide: UBER_CANONICAL_ORDER_FACTS_QUERY,
    inject: [ORDER_EXTERNAL_FACTS_READER],
    useFactory: (
      reader: OrderExternalFactsReaderPort,
    ): UberCanonicalOrderFactsQueryPort => ({
      findByExternalOrderId: async (externalOrderId) => {
        const order = await reader.findByExternalIdentity({
          channel: 'ubereats',
          externalOrderId,
        });
        if (!order) return null;
        return {
          orderStableId: order.orderStableId,
          status: order.status,
          totalCents: order.totalCents,
          referenceAt: new Date(order.paidAt ?? order.createdAt),
          fulfillmentTiming: order.fulfillmentTiming,
          externalEstimatedReadyAt: order.externalEstimatedReadyAt
            ? new Date(order.externalEstimatedReadyAt)
            : null,
        };
      },
      findSchedulingByOrderStableId: async (orderStableId) => {
        const timing =
          await reader.findSchedulingByOrderStableId(orderStableId);
        if (!timing) return null;
        return {
          orderStableId: timing.orderStableId,
          scheduledReadyAt: timing.scheduledReadyAt
            ? new Date(timing.scheduledReadyAt)
            : null,
          prepStartAt: timing.prepStartAt ? new Date(timing.prepStartAt) : null,
          prepDurationMinutes: timing.prepDurationMinutes,
        };
      },
    }),
  },
  {
    provide: UBER_CANONICAL_ORDER_CANCELLATION,
    inject: [ORDER_EXTERNAL_CANCELLATION_FINALIZER],
    useFactory: (
      finalizer: OrderExternalCancellationFinalizerPort,
    ): UberCanonicalOrderCancellationPort => ({
      finalizeConfirmedCancellation: async (input) => {
        const result = await finalizer.finalizeConfirmedCancellation({
          channel: 'ubereats',
          orderStableId: input.orderStableId,
          externalOrderId: input.externalOrderId,
          externalEventId: input.externalEventId,
          reason: input.reason,
          operatorName: input.operatorName,
          occurredAt: input.occurredAt.toISOString(),
        });
        UBER_ORDER_CANCELLATION_LOGGER.log({
          event: 'uber_order_cancelled',
          eventId: input.externalEventId,
          orderStableId: result.orderStableId,
          externalOrderId: input.externalOrderId,
          channel: 'ubereats',
          reasonCode: input.reason,
          refundCents: result.refundCents,
        });
        return result;
      },
    }),
  },
  {
    provide: UBER_ORDER_SYNC_REPOSITORY,
    inject: [ORDER_EXTERNAL_FACTS_READER],
    useFactory: (
      reader: OrderExternalFactsReaderPort,
    ): UberOrderSyncRepositoryPort => {
      const pendingStatuses = ['pending', 'paid', 'making'] as const;
      return {
        findSyncTarget: async (externalOrderId) => {
          const order = await reader.findByExternalIdentity({
            channel: 'ubereats',
            externalOrderId,
          });
          return (
            order && {
              orderStableId: order.orderStableId,
              status: order.status,
            }
          );
        },
        listPending: async (limit) =>
          (
            await reader.listByChannelAndStatuses({
              channel: 'ubereats',
              statuses: pendingStatuses,
              limit,
            })
          ).map((order) => ({
            ...order,
            createdAt: new Date(order.createdAt),
          })),
        pendingSummary: async () => {
          const summary = await reader.summarizeByChannelAndStatuses({
            channel: 'ubereats',
            statuses: pendingStatuses,
          });
          return {
            count: summary.count,
            updatedAt: summary.latestCreatedAt
              ? new Date(summary.latestCreatedAt)
              : null,
          };
        },
      };
    },
  },
  {
    provide: UBER_ORDER_OPERATIONS_REPOSITORY,
    inject: [ORDER_EXTERNAL_FACTS_READER],
    useFactory: (
      reader: OrderExternalFactsReaderPort,
    ): UberOrderOperationsRepositoryPort => ({
      reconciliationOrders: async (storeStableId, rangeStart, rangeEnd) =>
        reader.listReconciliationFacts({
          channel: 'ubereats',
          storeStableId,
          createdAtFrom: rangeStart.toISOString(),
          createdAtBefore: rangeEnd.toISOString(),
        }),
      exists: (externalOrderId) =>
        reader.existsByExternalIdentity({
          channel: 'ubereats',
          externalOrderId,
        }),
    }),
  },
  {
    provide: UBER_ORDER_ACTION_REPOSITORY,
    inject: [
      UberOrderActionPrismaAdapter,
      ORDER_EXTERNAL_TRANSITION_COORDINATOR,
    ],
    useFactory: (
      persistence: UberOrderActionPrismaAdapter,
      coordinator: OrderExternalTransitionCoordinatorPort,
    ): UberOrderActionRepositoryPort => ({
      enqueue: (input) => persistence.enqueue(input),
      requeue: (input) => persistence.requeue(input),
      claim: (input) => persistence.claim(input),
      complete: (input) =>
        coordinator.completeProviderConfirmedTransition(
          { channel: 'ubereats', transition: input.transition },
          (transaction) =>
            persistence.completeWithinTransaction(transaction, input),
        ),
      markFailed: (taskId, leaseToken, input) =>
        persistence.markFailed(taskId, leaseToken, input),
    }),
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
 * The dedicated process intentionally gets no HTTP controllers, AuthModule or
 * OrdersModule. Cross-context implementation bridges are assembled here so the
 * process bootstrap never reaches through module boundaries to Prisma or order
 * internals.
 */
@Module({})
class UberEatsWorkerRuntimeCompositionModule {}

export function createUberEatsWorkerRuntimeModule(
  workerProviders: readonly Provider[],
): DynamicModule {
  return {
    module: UberEatsWorkerRuntimeCompositionModule,
    imports: [
      PrismaModule,
      BrandStoreConfigModule,
      CatalogExternalMenuFactsModule,
      OrderExternalFactsModule,
      OrderExternalTransitionModule,
      OrderExternalCancellationModule,
    ],
    providers: [
      ORDER_INGESTION_PROVIDER,
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
  imports: [
    PrismaModule,
    BrandStoreConfigModule,
    CatalogExternalMenuFactsModule,
    OrderExternalFactsModule,
    OrderExternalTransitionModule,
    OrderExternalCancellationModule,
    AuthModule,
    OrdersModule,
  ],
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
    UBER_EATS_REPORTING,
    UBER_EATS_STORE_STATUS_SYNC,
    ClaimAndProcessUberWebhookInboxUseCase,
    ClaimAndExecuteUberOrderActionsUseCase,
    UberWorkerConfigService,
  ],
})
export class UberEatsModule {}
