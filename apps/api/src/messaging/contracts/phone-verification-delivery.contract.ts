export const PHONE_VERIFICATION_DELIVERY = Symbol(
  'PHONE_VERIFICATION_DELIVERY',
);

export type PhoneVerificationDeliveryInput = {
  phone: string;
  code: string;
  expiresInMin: number;
  locale?: string;
  purpose: string;
};

export type PhoneVerificationDeliveryResult = {
  ok: boolean;
  sendId: string;
  error?: string;
};

export interface PhoneVerificationDeliveryPort {
  sendVerificationSms(
    input: PhoneVerificationDeliveryInput,
  ): Promise<PhoneVerificationDeliveryResult>;
}
