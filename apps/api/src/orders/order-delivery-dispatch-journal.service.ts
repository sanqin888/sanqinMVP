import { Injectable } from '@nestjs/common';
import type { UberDirectDeliveryResult } from '../deliveries/public-api';
import {
  ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
  ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
  ORDER_DELIVERY_DISPATCH_SOURCE,
  ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
  ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
  orderDeliveryDispatchFailedIdempotencyKey,
  orderDeliveryDispatchRequestedIdempotencyKey,
  orderDeliveryDispatchSucceededIdempotencyKey,
  orderDeliveryDispatchUnknownIdempotencyKey,
} from './order-delivery-dispatch-journal';
import { PrismaService } from './orders-prisma';

export type DeliveryDispatchFailureDetail = {
  attempt: number;
  reason: string;
  errorMessage: string;
  statusCode?: number | null;
};

type DispatchOutcomeBase = {
  orderStableId: string;
  attempt: number;
  externalReference?: string;
};

@Injectable()
export class OrderDeliveryDispatchJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async persistProviderSuccess(params: {
    orderDbId: string;
    orderStableId: string;
    attempt: number;
    externalReference: string;
    response: UberDirectDeliveryResult;
  }): Promise<'SUCCEEDED' | 'UNKNOWN'> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: params.orderDbId },
        select: { externalDeliveryId: true },
      });
      if (!current) {
        throw new Error('ORDER_DISAPPEARED_DURING_DELIVERY_BIND');
      }

      if (
        current.externalDeliveryId &&
        current.externalDeliveryId !== params.response.deliveryId
      ) {
        await tx.opsEvent.createMany({
          data: this.unknownEvent({
            orderStableId: params.orderStableId,
            attempt: params.attempt,
            externalReference: params.externalReference,
            reason: 'LOCAL_BIND_CONFLICT',
            errorMessage: `Uber returned provider delivery ${params.response.deliveryId}, but SanQ Order is already bound to ${current.externalDeliveryId}. Verify both deliveries in Uber Direct Dashboard and resolve any duplicate before reconciling.`,
            providerDeliveryId: params.response.deliveryId,
            existingProviderDeliveryId: current.externalDeliveryId,
            failureHistory: [
              {
                attempt: params.attempt,
                reason: 'LOCAL_BIND_CONFLICT',
                errorMessage: `Uber returned provider delivery ${params.response.deliveryId}, but SanQ Order is already bound to ${current.externalDeliveryId}. Verify both deliveries in Uber Direct Dashboard and resolve any duplicate before reconciling.`,
                statusCode: null,
              },
            ],
          }),
          skipDuplicates: true,
        });
        return 'UNKNOWN';
      }

      if (!current.externalDeliveryId) {
        const updated = await tx.order.updateMany({
          where: {
            id: params.orderDbId,
            externalDeliveryId: null,
          },
          data: { externalDeliveryId: params.response.deliveryId },
        });
        if (updated.count === 0) {
          const raced = await tx.order.findUnique({
            where: { id: params.orderDbId },
            select: { externalDeliveryId: true },
          });
          if (
            raced?.externalDeliveryId &&
            raced.externalDeliveryId !== params.response.deliveryId
          ) {
            await tx.opsEvent.createMany({
              data: this.unknownEvent({
                orderStableId: params.orderStableId,
                attempt: params.attempt,
                externalReference: params.externalReference,
                reason: 'LOCAL_BIND_CONFLICT',
                errorMessage: `Uber returned provider delivery ${params.response.deliveryId}, but SanQ Order concurrently became bound to ${raced.externalDeliveryId}. Verify both deliveries in Uber Direct Dashboard and resolve any duplicate before reconciling.`,
                providerDeliveryId: params.response.deliveryId,
                existingProviderDeliveryId: raced.externalDeliveryId,
                failureHistory: [
                  {
                    attempt: params.attempt,
                    reason: 'LOCAL_BIND_CONFLICT',
                    errorMessage: `Uber returned provider delivery ${params.response.deliveryId}, but SanQ Order concurrently became bound to ${raced.externalDeliveryId}. Verify both deliveries in Uber Direct Dashboard and resolve any duplicate before reconciling.`,
                    statusCode: null,
                  },
                ],
              }),
              skipDuplicates: true,
            });
            return 'UNKNOWN';
          }
          if (!raced?.externalDeliveryId) {
            throw new Error('DELIVERY_BIND_COMPARE_AND_SET_FAILED');
          }
        }
      }

      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderDeliveryDispatchSucceededIdempotencyKey(
            params.orderStableId,
            params.attempt,
          ),
          eventName: ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
          source: ORDER_DELIVERY_DISPATCH_SOURCE,
          payload: {
            orderStableId: params.orderStableId,
            attempt: params.attempt,
            externalReference: params.externalReference,
            providerDeliveryId: params.response.deliveryId,
            providerExternalDeliveryId: params.response.externalDeliveryId,
            providerStatus: params.response.status ?? null,
          },
        },
        skipDuplicates: true,
      });
      return 'SUCCEEDED';
    });
  }

  async recordSucceeded(
    params: DispatchOutcomeBase & {
      providerDeliveryId: string;
      reason: string;
    },
  ): Promise<void> {
    await this.prisma.opsEvent.createMany({
      data: {
        idempotencyKey: orderDeliveryDispatchSucceededIdempotencyKey(
          params.orderStableId,
          params.attempt,
        ),
        eventName: ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
        source: ORDER_DELIVERY_DISPATCH_SOURCE,
        payload: {
          orderStableId: params.orderStableId,
          attempt: params.attempt,
          externalReference: params.externalReference ?? params.orderStableId,
          providerDeliveryId: params.providerDeliveryId,
          reason: params.reason,
        },
      },
      skipDuplicates: true,
    });
  }

  async recordFailed(
    params: DispatchOutcomeBase & {
      reason: string;
      errorMessage: string;
      statusCode?: number;
      failureHistory?: DeliveryDispatchFailureDetail[];
    },
  ): Promise<void> {
    await this.prisma.opsEvent.createMany({
      data: {
        idempotencyKey: orderDeliveryDispatchFailedIdempotencyKey(
          params.orderStableId,
          params.attempt,
        ),
        eventName: ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
        source: ORDER_DELIVERY_DISPATCH_SOURCE,
        payload: {
          orderStableId: params.orderStableId,
          attempt: params.attempt,
          externalReference: params.externalReference ?? params.orderStableId,
          reason: params.reason,
          errorMessage: sanitizeErrorMessage(params.errorMessage),
          statusCode: params.statusCode ?? null,
          failureHistory: sanitizeFailureHistory(params.failureHistory),
        },
      },
      skipDuplicates: true,
    });
  }

  async recordUnknown(
    params: DispatchOutcomeBase & {
      reason: string;
      errorMessage: string;
      statusCode?: number;
      failureHistory?: DeliveryDispatchFailureDetail[];
    },
  ): Promise<void> {
    await this.prisma.opsEvent.createMany({
      data: this.unknownEvent({
        orderStableId: params.orderStableId,
        attempt: params.attempt,
        externalReference: params.externalReference ?? params.orderStableId,
        reason: params.reason,
        errorMessage: sanitizeErrorMessage(params.errorMessage),
        statusCode: params.statusCode ?? null,
        failureHistory: params.failureHistory,
      }),
      skipDuplicates: true,
    });
  }

  async recordFailedAndScheduleAutomaticRetry(params: {
    orderStableId: string;
    attempt: number;
    externalReference: string;
    reason: string;
    errorMessage: string;
    statusCode?: number;
    nextAttempt: number;
    automaticRetriesRemaining: number;
    notBefore: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.opsEvent.createMany({
        data: [
          {
            idempotencyKey: orderDeliveryDispatchFailedIdempotencyKey(
              params.orderStableId,
              params.attempt,
            ),
            eventName: ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
            source: ORDER_DELIVERY_DISPATCH_SOURCE,
            payload: {
              orderStableId: params.orderStableId,
              attempt: params.attempt,
              externalReference: params.externalReference,
              reason: params.reason,
              errorMessage: sanitizeErrorMessage(params.errorMessage),
              statusCode: params.statusCode ?? null,
              failureHistory: null,
            },
          },
          {
            idempotencyKey: orderDeliveryDispatchRequestedIdempotencyKey(
              params.orderStableId,
              params.nextAttempt,
            ),
            eventName: ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
            source: ORDER_DELIVERY_DISPATCH_SOURCE,
            payload: {
              orderStableId: params.orderStableId,
              attempt: params.nextAttempt,
              externalReference: params.externalReference,
              trigger: 'AUTO_SAFE_RETRY',
              automaticRetriesRemaining: params.automaticRetriesRemaining,
              notBefore: params.notBefore.toISOString(),
              previousAttempt: params.attempt,
            },
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  async listFailureHistory(
    orderStableId: string,
    minimumAttempt = 1,
  ): Promise<DeliveryDispatchFailureDetail[]> {
    const rows = await this.prisma.opsEvent.findMany({
      where: {
        source: ORDER_DELIVERY_DISPATCH_SOURCE,
        eventName: {
          in: [
            ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
            ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
          ],
        },
        payload: { path: ['orderStableId'], equals: orderStableId },
      },
      select: { payload: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });

    return rows
      .map<DeliveryDispatchFailureDetail | null>((row) => {
        const payload =
          row.payload &&
          typeof row.payload === 'object' &&
          !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null;
        const attempt =
          typeof payload?.attempt === 'number'
            ? payload.attempt
            : Number(payload?.attempt);
        const reason =
          typeof payload?.reason === 'string' ? payload.reason.trim() : '';
        const errorMessage =
          typeof payload?.errorMessage === 'string'
            ? payload.errorMessage.trim()
            : '';
        const statusCode =
          typeof payload?.statusCode === 'number' ? payload.statusCode : null;
        if (
          !Number.isInteger(attempt) ||
          attempt < Math.max(1, minimumAttempt) ||
          !reason
        ) {
          return null;
        }
        return {
          attempt,
          reason,
          errorMessage: errorMessage || reason,
          statusCode,
        } satisfies DeliveryDispatchFailureDetail;
      })
      .filter((item): item is DeliveryDispatchFailureDetail => item !== null)
      .reverse();
  }

  private unknownEvent(params: {
    orderStableId: string;
    attempt: number;
    externalReference: string;
    reason: string;
    errorMessage?: string;
    statusCode?: number | null;
    providerDeliveryId?: string;
    existingProviderDeliveryId?: string;
    failureHistory?: DeliveryDispatchFailureDetail[];
  }) {
    return {
      idempotencyKey: orderDeliveryDispatchUnknownIdempotencyKey(
        params.orderStableId,
        params.attempt,
      ),
      eventName: ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
      source: ORDER_DELIVERY_DISPATCH_SOURCE,
      payload: {
        orderStableId: params.orderStableId,
        attempt: params.attempt,
        externalReference: params.externalReference,
        reason: params.reason,
        errorMessage: params.errorMessage ?? null,
        statusCode: params.statusCode ?? null,
        providerDeliveryId: params.providerDeliveryId ?? null,
        existingProviderDeliveryId: params.existingProviderDeliveryId ?? null,
        failureHistory: sanitizeFailureHistory(params.failureHistory),
      },
    };
  }
}

export function sanitizeDeliveryDispatchErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 2_000);
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function sanitizeFailureHistory(
  history: DeliveryDispatchFailureDetail[] | undefined,
): DeliveryDispatchFailureDetail[] | null {
  if (!history) return null;
  return history.slice(-8).map((failure) => ({
    attempt: failure.attempt,
    reason: failure.reason,
    errorMessage: sanitizeErrorMessage(failure.errorMessage),
    statusCode:
      typeof failure.statusCode === 'number' ? failure.statusCode : null,
  }));
}
