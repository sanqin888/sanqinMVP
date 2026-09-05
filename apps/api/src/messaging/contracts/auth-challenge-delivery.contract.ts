export const AUTH_CHALLENGE_DELIVERY = Symbol('AUTH_CHALLENGE_DELIVERY');

export type AuthChallengeDeliveryResult = {
  ok: boolean;
  sendId: string;
  error?: string;
};

type AuthChallengeOtpInput = {
  code: string;
  expiresInMin: number;
  locale?: string;
};

export type LoginTwoFactorSmsDeliveryInput = AuthChallengeOtpInput & {
  phone: string;
  userStableId: string;
};

export type LoginTwoFactorEmailDeliveryInput = AuthChallengeOtpInput & {
  email: string;
  userStableId: string;
};

export type PhoneEnrollmentSmsDeliveryInput = AuthChallengeOtpInput & {
  phone: string;
  userStableId: string;
};

export type MembershipLoginSmsDeliveryInput = AuthChallengeOtpInput & {
  phone: string;
};

export interface AuthChallengeDeliveryPort {
  sendLoginTwoFactorSms(
    input: LoginTwoFactorSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult>;
  sendLoginTwoFactorEmail(
    input: LoginTwoFactorEmailDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult>;
  sendPhoneEnrollmentSms(
    input: PhoneEnrollmentSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult>;
  sendMembershipLoginSms(
    input: MembershipLoginSmsDeliveryInput,
  ): Promise<AuthChallengeDeliveryResult>;
}
