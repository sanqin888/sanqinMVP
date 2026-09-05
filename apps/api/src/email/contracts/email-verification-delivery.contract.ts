export const EMAIL_VERIFICATION_DELIVERY = Symbol(
  'EMAIL_VERIFICATION_DELIVERY',
);

export type EmailVerificationDeliveryInput = {
  to: string;
  token: string;
  name?: string | null;
  locale?: string;
};

export type EmailVerificationDeliveryResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  sendId: string;
};

export interface EmailVerificationDeliveryPort {
  sendVerificationEmail(
    input: EmailVerificationDeliveryInput,
  ): Promise<EmailVerificationDeliveryResult>;
}
