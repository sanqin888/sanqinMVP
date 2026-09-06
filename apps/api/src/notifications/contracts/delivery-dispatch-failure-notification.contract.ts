export const DELIVERY_DISPATCH_FAILURE_NOTIFICATION = Symbol(
  'DELIVERY_DISPATCH_FAILURE_NOTIFICATION',
);

export type DeliveryDispatchFailureNotificationRecipient = {
  userStableId: string;
  email: string | null;
  phone: string | null;
  locale: 'zh' | 'en';
};

export type DeliveryDispatchFailureNotificationInput = {
  recipients: DeliveryDispatchFailureNotificationRecipient[];
  orderNumber: string;
  deliveryProvider: string;
  errorMessage: string;
  orderDetailUrl: string;
};

export type DeliveryDispatchFailureNotificationResult = {
  ok: boolean;
  sentCount?: number;
  failedCount?: number;
  reason?: 'no_recipients';
};

export interface DeliveryDispatchFailureNotificationPort {
  notifyDeliveryDispatchFailed(
    input: DeliveryDispatchFailureNotificationInput,
  ): Promise<DeliveryDispatchFailureNotificationResult>;
}
