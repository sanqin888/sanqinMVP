import type { Channel } from '@shared/order';

export const ORDER_EXTERNAL_CANCELLATION_FINALIZER = Symbol(
  'ORDER_EXTERNAL_CANCELLATION_FINALIZER',
);

export type OrderExternalCancellationInput = Readonly<{
  channel: Channel;
  orderStableId: string;
  externalOrderId: string;
  externalEventId: string;
  reason: string;
  operatorName: string;
  occurredAt: string | null;
}>;

export type OrderExternalCancellationResult = Readonly<{
  orderStableId: string;
  refundCents: number;
}>;

export interface OrderExternalCancellationFinalizerPort {
  finalizeConfirmedCancellation(
    input: OrderExternalCancellationInput,
  ): Promise<OrderExternalCancellationResult>;
}
