export const CUSTOMER_LIFECYCLE_NOTIFICATION = Symbol(
  'CUSTOMER_LIFECYCLE_NOTIFICATION',
);

export type CustomerLifecycleNotificationLanguage = 'ZH' | 'EN';

export type RegistrationWelcomeNotificationInput = {
  userStableId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  language: CustomerLifecycleNotificationLanguage;
};

export type SubscriptionWelcomeNotificationInput = {
  userStableId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  language: CustomerLifecycleNotificationLanguage;
};

export interface CustomerLifecycleNotificationPort {
  notifyRegistrationWelcome(
    input: RegistrationWelcomeNotificationInput,
  ): Promise<void>;

  notifySubscriptionWelcome(
    input: SubscriptionWelcomeNotificationInput,
  ): Promise<void>;
}
