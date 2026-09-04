export const IDENTITY_EMAIL_VERIFICATION = Symbol(
  'IDENTITY_EMAIL_VERIFICATION',
);

export type RequestUserEmailVerificationInput = {
  userStableId: string;
  email: string;
};

export type VerifyUserEmailCodeInput = {
  userStableId: string;
  code: string;
};

export type RequestCheckoutEmailVerificationInput = {
  email: string;
  locale?: string;
  purpose?: 'checkout';
};

export type VerifyCheckoutEmailCodeInput = {
  email: string;
  token: string;
  purpose?: 'checkout';
};

export type ValidateCheckoutEmailVerificationInput = {
  email: string;
  verificationToken: string;
};

export type EmailVerificationResult = {
  ok: boolean;
  error?: string;
  alreadyVerified?: boolean;
  email?: string;
  verificationToken?: string;
};

export interface IdentityEmailVerificationPort {
  requestUserVerification(
    input: RequestUserEmailVerificationInput,
  ): Promise<EmailVerificationResult>;
  verifyUserEmailCode(
    input: VerifyUserEmailCodeInput,
  ): Promise<EmailVerificationResult>;
  requestCheckoutVerification(
    input: RequestCheckoutEmailVerificationInput,
  ): Promise<EmailVerificationResult>;
  verifyCheckoutToken(
    input: VerifyCheckoutEmailCodeInput,
  ): Promise<EmailVerificationResult>;
  validateCheckoutVerificationToken(
    input: ValidateCheckoutEmailVerificationInput,
  ): Promise<boolean>;
}
