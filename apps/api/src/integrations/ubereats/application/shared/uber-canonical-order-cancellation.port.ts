export const UBER_CANONICAL_ORDER_CANCELLATION = Symbol(
  'UBER_CANONICAL_ORDER_CANCELLATION',
);

export type UberCanonicalOrderCancellationInput = Readonly<{
  orderStableId: string;
  externalOrderId: string;
  externalEventId: string;
  reason: string;
  operatorName: string;
  occurredAt: Date;
}>;

export type UberCanonicalOrderCancellationResult = Readonly<{
  orderStableId: string;
  refundCents: number;
}>;

export interface UberCanonicalOrderCancellationPort {
  finalizeConfirmedCancellation(
    input: UberCanonicalOrderCancellationInput,
  ): Promise<UberCanonicalOrderCancellationResult>;
}
