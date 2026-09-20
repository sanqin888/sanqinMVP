import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DeliveryProvider,
  FulfillmentType,
  OrderStatus,
} from '@prisma/client';
import {
  OPERATIONS_ALERT_RECIPIENTS,
  type OperationsAlertRecipientPort,
} from '../auth/public-api';
import {
  UBER_DIRECT_DELIVERY_DISPATCHER,
  UberDirectDeliveryDispatchError,
  type UberDirectDeliveryDispatcherPort,
  type UberDirectDeliveryResult,
  type UberDirectDropoffDetails,
} from '../deliveries/public-api';
import {
  DELIVERY_DISPATCH_FAILURE_NOTIFICATION,
  type DeliveryDispatchFailureNotificationPort,
} from '../notifications/public-api';
import {
  OrderDeliveryDispatchJournalService,
  sanitizeDeliveryDispatchErrorMessage,
  type DeliveryDispatchFailureDetail,
} from './order-delivery-dispatch-journal.service';
import {
  readAutomaticRetryDelayMs,
  UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
} from './order-delivery-dispatch-journal';
import {
  computeOrderDeliveryPickupReadyAtFromCheckoutMetadata,
  extractOrderDeliveryDestinationFromCheckoutMetadata,
} from './order-delivery-checkout-metadata';
import { PrismaService } from './orders-prisma';

export type DurableOrderDeliveryDispatchAttemptInput = {
  orderStableId: string;
  attempt: number;
  automaticRetriesRemaining: number;
};

const DURABLE_DISPATCHABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
]);

@Injectable()
export class OrderDeliveryDispatchUseCase {
  private readonly logger = new Logger(OrderDeliveryDispatchUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchJournal: OrderDeliveryDispatchJournalService,
    @Inject(UBER_DIRECT_DELIVERY_DISPATCHER)
    private readonly uberDirectDispatcher: UberDirectDeliveryDispatcherPort,
    @Inject(OPERATIONS_ALERT_RECIPIENTS)
    private readonly operationsAlertRecipients: OperationsAlertRecipientPort,
    @Inject(DELIVERY_DISPATCH_FAILURE_NOTIFICATION)
    private readonly deliveryDispatchFailureNotification: DeliveryDispatchFailureNotificationPort,
  ) {}

  async handleDurableAttempt(
    input: DurableOrderDeliveryDispatchAttemptInput,
  ): Promise<void> {
    const orderStableId = input.orderStableId.trim();
    const attempt = Math.round(input.attempt);
    const automaticRetriesRemaining = Math.max(
      0,
      Math.min(
        UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
        Math.round(input.automaticRetriesRemaining),
      ),
    );
    if (
      !orderStableId ||
      !Number.isInteger(attempt) ||
      attempt < 1 ||
      !Number.isInteger(automaticRetriesRemaining)
    ) {
      throw new Error('INVALID_DURABLE_DELIVERY_DISPATCH_ATTEMPT');
    }
    const cycleStartAttempt = Math.max(
      1,
      attempt -
        (UBER_DIRECT_AUTOMATIC_RETRY_COUNT - automaticRetriesRemaining),
    );

    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      include: { items: true },
    });

    if (!order) {
      await this.dispatchJournal.recordFailed({
        orderStableId,
        attempt,
        reason: 'ORDER_NOT_FOUND',
        errorMessage: 'Order no longer exists',
      });
      return;
    }

    const orderNumber = order.clientRequestId ?? order.orderStableId;
    const externalReference = orderNumber;

    if (
      order.fulfillmentType !== FulfillmentType.delivery ||
      order.deliveryProvider !== DeliveryProvider.UBER
    ) {
      await this.dispatchJournal.recordFailed({
        orderStableId,
        attempt,
        externalReference,
        reason: 'ORDER_NOT_UBER_DELIVERY',
        errorMessage: 'Order is not an Uber Direct delivery',
      });
      return;
    }

    if (order.externalDeliveryId) {
      await this.dispatchJournal.recordSucceeded({
        orderStableId,
        attempt,
        externalReference,
        providerDeliveryId: order.externalDeliveryId,
        reason: 'ALREADY_BOUND',
      });
      return;
    }

    if (!DURABLE_DISPATCHABLE_STATUSES.has(order.status)) {
      await this.dispatchJournal.recordFailed({
        orderStableId,
        attempt,
        externalReference,
        reason: 'ORDER_NOT_DISPATCHABLE',
        errorMessage: `Order status ${order.status} is not eligible for new delivery dispatch`,
      });
      return;
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    let destination: UberDirectDropoffDetails | null = null;
    try {
      destination = extractOrderDeliveryDestinationFromCheckoutMetadata(
        checkoutIntent?.metadataJson ?? null,
        order,
      );
      if (!destination) {
        throw new Error('DELIVERY_DESTINATION_REQUIRED');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const failureHistory: DeliveryDispatchFailureDetail[] = [
        {
          attempt,
          reason: 'LOCAL_VALIDATION_FAILED',
          errorMessage,
          statusCode: null,
        },
      ];
      await this.dispatchJournal.recordFailed({
        orderStableId,
        attempt,
        externalReference,
        reason: 'LOCAL_VALIDATION_FAILED',
        errorMessage,
        failureHistory,
      });
      await this.notifyDeliveryDispatchFailure({
        orderStableId,
        orderNumber,
        deliveryProvider: 'Uber Direct',
        errorMessage: this.formatFailureHistory(
          failureHistory,
          'Local validation failed; automatic retries were skipped because the same request would fail again',
        ),
        reconciliationRequired: true,
      });
      return;
    }

    let response: UberDirectDeliveryResult;
    try {
      response = await this.uberDirectDispatcher.createDelivery({
        orderRef: externalReference,
        pickupCode: order.pickupCode ?? undefined,
        reference: externalReference,
        totalCents: order.totalCents ?? 0,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
        pickupReadyAt: computeOrderDeliveryPickupReadyAtFromCheckoutMetadata({
          acceptedAt: order.paidAt,
          metadata: checkoutIntent?.metadataJson,
        }),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        error instanceof UberDirectDeliveryDispatchError &&
        error.failureKind === 'SAFE_TO_RETRY'
      ) {
        const currentFailure: DeliveryDispatchFailureDetail = {
          attempt,
          reason: 'PROVIDER_REJECTED',
          errorMessage,
          statusCode: error.statusCode ?? null,
        };

        if (automaticRetriesRemaining > 0) {
          const nextAttempt = attempt + 1;
          const retryDelayMs = readAutomaticRetryDelayMs(
            automaticRetriesRemaining,
          );
          await this.dispatchJournal.recordFailedAndScheduleAutomaticRetry({
            orderStableId,
            attempt,
            externalReference,
            reason: currentFailure.reason,
            errorMessage,
            statusCode: currentFailure.statusCode ?? undefined,
            nextAttempt,
            automaticRetriesRemaining: automaticRetriesRemaining - 1,
            notBefore: new Date(Date.now() + retryDelayMs),
          });
          this.logger.warn({
            event: 'uber_direct_dispatch_auto_retry_scheduled',
            orderStableId,
            attempt,
            nextAttempt,
            automaticRetriesRemaining: automaticRetriesRemaining - 1,
            retryDelayMs,
            statusCode: error.statusCode ?? null,
            errorMessage: sanitizeDeliveryDispatchErrorMessage(errorMessage),
          });
          return;
        }

        const failureHistory = [
          ...(await this.dispatchJournal.listFailureHistory(
            orderStableId,
            cycleStartAttempt,
          )),
          currentFailure,
        ];
        await this.dispatchJournal.recordFailed({
          orderStableId,
          attempt,
          externalReference,
          reason: currentFailure.reason,
          errorMessage,
          statusCode: currentFailure.statusCode ?? undefined,
          failureHistory,
        });
        await this.notifyDeliveryDispatchFailure({
          orderStableId,
          orderNumber,
          deliveryProvider: 'Uber Direct',
          errorMessage: this.formatFailureHistory(
            failureHistory,
            'Automatic retries exhausted',
          ),
          reconciliationRequired: true,
        });
        return;
      }

      const currentFailure: DeliveryDispatchFailureDetail = {
        attempt,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        errorMessage,
        statusCode:
          error instanceof UberDirectDeliveryDispatchError
            ? (error.statusCode ?? null)
            : null,
      };
      const failureHistory = [
        ...(await this.dispatchJournal.listFailureHistory(
          orderStableId,
          cycleStartAttempt,
        )),
        currentFailure,
      ];
      await this.dispatchJournal.recordUnknown({
        orderStableId,
        attempt,
        externalReference,
        reason: currentFailure.reason,
        errorMessage,
        statusCode: currentFailure.statusCode ?? undefined,
        failureHistory,
      });
      this.logger.error({
        event: 'uber_direct_dispatch_reconciliation_required',
        orderStableId,
        attempt,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      await this.notifyReconciliationRequired({
        orderStableId,
        orderNumber,
        attempt,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        failureHistory,
      });
      return;
    }

    try {
      const outcome = await this.dispatchJournal.persistProviderSuccess({
        orderDbId: order.id,
        orderStableId,
        attempt,
        externalReference,
        response,
      });
      if (outcome === 'UNKNOWN') {
        this.logger.error({
          event: 'uber_direct_dispatch_reconciliation_required',
          orderStableId,
          attempt,
          reason: 'LOCAL_BIND_CONFLICT',
          providerDeliveryId: response.deliveryId,
        });
        await this.notifyReconciliationRequired({
          orderStableId,
          orderNumber,
          attempt,
          reason: 'LOCAL_BIND_CONFLICT',
          failureHistory: await this.dispatchJournal.listFailureHistory(
            orderStableId,
            cycleStartAttempt,
          ),
        });
        return;
      }

      this.logger.log({
        event: 'uber_direct_dispatch_succeeded',
        orderStableId,
        attempt,
        providerDeliveryId: response.deliveryId,
      });
    } catch (error) {
      this.logger.error({
        event: 'uber_direct_delivery_created_persistence_failed',
        orderId: order.id,
        orderStableId,
        attempt,
        providerDeliveryId: response.deliveryId,
        reason: error instanceof Error ? error.message : String(error),
      });
      // Deliberately leave attempt_started without a terminal event. The durable
      // processor will conservatively turn a stale claim into UNKNOWN after the
      // database/process recovers. Never re-POST automatically.
      throw error;
    }
  }

  async notifyReconciliationRequired(params: {
    orderStableId: string;
    orderNumber: string;
    attempt: number;
    reason: string;
    failureHistory?: DeliveryDispatchFailureDetail[];
  }): Promise<void> {
    const details =
      params.failureHistory && params.failureHistory.length > 0
        ? this.formatFailureHistory(
            params.failureHistory,
            'Provider outcome is UNKNOWN; automatic retry is blocked to avoid duplicate courier creation',
          )
        : `Provider outcome is UNKNOWN at attempt ${params.attempt} (${params.reason}); automatic retry is blocked to avoid duplicate courier creation.`;

    await this.notifyDeliveryDispatchFailure({
      orderStableId: params.orderStableId,
      orderNumber: params.orderNumber,
      deliveryProvider: 'Uber Direct',
      errorMessage:
        `${details} Search Uber Direct Dashboard for ${params.orderNumber}. If the delivery exists, bind its orderUuid in SanQ. If it does not exist, use the SanQ retry button. If you create it manually in Dashboard, return to SanQ and bind the new orderUuid.`,
      reconciliationRequired: true,
    });
  }

  private async notifyDeliveryDispatchFailure(params: {
    orderStableId: string;
    orderNumber: string;
    deliveryProvider: string;
    errorMessage: string;
    reconciliationRequired?: boolean;
  }): Promise<void> {
    try {
      const recipients =
        await this.operationsAlertRecipients.listActiveAdminRecipients();
      if (recipients.length === 0) {
        this.logger.warn({
          event: 'delivery_dispatch_failure_alert_skipped',
          orderStableId: params.orderStableId,
          reason: 'NO_ACTIVE_ADMIN_CONTACT',
        });
        return;
      }

      const publicBaseUrl = (
        process.env.PUBLIC_BASE_URL ?? 'https://sanq.ca'
      ).replace(/\/$/, '');
      const result =
        await this.deliveryDispatchFailureNotification.notifyDeliveryDispatchFailed(
          {
            recipients: recipients.map((recipient) => ({
              userStableId: recipient.userStableId,
              email: recipient.email,
              phone: recipient.phone,
              locale: recipient.language === 'ZH' ? 'zh' : 'en',
            })),
            orderNumber: params.orderNumber,
            deliveryProvider: params.deliveryProvider,
            errorMessage: sanitizeDeliveryDispatchErrorMessage(params.errorMessage),
            orderDetailUrl: params.reconciliationRequired
              ? `${publicBaseUrl}/zh/admin/delivery-dispatch?order=${encodeURIComponent(
                  params.orderStableId,
                )}`
              : `${publicBaseUrl}/zh/order/${params.orderStableId}`,
          },
        );

      if (!result.ok) {
        this.logger.warn({
          event: 'delivery_dispatch_failure_alert_failed',
          orderStableId: params.orderStableId,
          sentCount: result.sentCount ?? 0,
          failedCount: result.failedCount ?? recipients.length,
          reason: result.reason ?? 'DELIVERY_FAILED',
        });
      }
    } catch (alertError) {
      this.logger.error({
        event: 'delivery_dispatch_failure_alert_exception',
        orderStableId: params.orderStableId,
        errorType:
          alertError instanceof Error ? alertError.name : 'UnknownError',
      });
    }
  }

  private formatFailureHistory(
    history: DeliveryDispatchFailureDetail[],
    headline: string,
  ): string {
    const details = history
      .slice(-8)
      .map((failure) => {
        const status =
          typeof failure.statusCode === 'number'
            ? `HTTP ${failure.statusCode}`
            : 'no HTTP status';
        return `Attempt ${failure.attempt}: ${failure.reason}; ${status}; ${sanitizeDeliveryDispatchErrorMessage(
          failure.errorMessage,
        ).slice(0, 320)}`;
      })
      .join(' | ');
    return `${headline}. ${details}`;
  }

}
