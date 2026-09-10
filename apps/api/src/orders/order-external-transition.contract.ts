import type { Channel, OrderStatus } from '@shared/order';

export const ORDER_EXTERNAL_TRANSITION_COORDINATOR = Symbol(
  'ORDER_EXTERNAL_TRANSITION_COORDINATOR',
);

declare const ORDER_EXTERNAL_TRANSITION_TRANSACTION_BRAND: unique symbol;

/**
 * Opaque handle for the shared database transaction owned by Orders.
 * Cross-context extensions may only pass it back to their infrastructure adapter;
 * the public contract deliberately exposes no Prisma type or database identity.
 */
export type OrderExternalTransitionTransaction = Readonly<{
  [ORDER_EXTERNAL_TRANSITION_TRANSACTION_BRAND]: true;
}>;

export type OrderExternalTransition = Readonly<{
  from: OrderStatus;
  to: OrderStatus;
}>;

export type OrderExternalTransitionCompletion = Readonly<{
  externalOrderId: string;
  completedAt: Date;
  acceptanceConfirmed: boolean;
}>;

export type OrderExternalTransitionWithinTransaction = (
  transaction: OrderExternalTransitionTransaction,
) => Promise<OrderExternalTransitionCompletion | null>;

export interface OrderExternalTransitionCoordinatorPort {
  completeProviderConfirmedTransition(
    input: {
      channel: Channel;
      transition: OrderExternalTransition | null;
    },
    withinTransaction: OrderExternalTransitionWithinTransaction,
  ): Promise<boolean>;
}
