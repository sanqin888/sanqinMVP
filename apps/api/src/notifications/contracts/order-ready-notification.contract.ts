export const ORDER_READY_NOTIFICATION = Symbol('ORDER_READY_NOTIFICATION');

export type OrderReadyNotificationInput = {
  email?: string | null;
  phone?: string | null;
  orderNumber: string;
  name?: string | null;
  locale?: string;
  userStableId?: string | null;
};

export type OrderReadyNotificationResult = {
  ok: boolean;
  finalChannel: 'email' | 'sms' | null;
  attemptedChannels: readonly ('email' | 'sms')[];
  reason?: string;
  error?: string;
  fallbackReason?: string;
  sendId?: string;
};

export interface OrderReadyNotificationPort {
  notifyOrderReady(
    input: OrderReadyNotificationInput,
  ): Promise<OrderReadyNotificationResult>;
}
