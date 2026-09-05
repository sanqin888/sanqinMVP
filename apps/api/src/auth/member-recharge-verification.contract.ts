export const MEMBER_RECHARGE_VERIFICATION = Symbol(
  'MEMBER_RECHARGE_VERIFICATION',
);

export type MemberRechargeVerificationResult = {
  ok: boolean;
  error?: string;
  verificationToken?: string;
};

export type MemberRechargeSendCodeInput = {
  userStableId: string;
  email?: string;
  phone?: string;
  locale?: string;
};

export type MemberRechargeVerifyCodeInput = {
  userStableId: string;
  email?: string;
  phone?: string;
  code?: string;
};

export type MemberRechargeConsumeTokenInput = {
  userStableId: string;
  verificationToken: string;
};

export type MemberRechargeVerificationErrorCode =
  | 'USER_STABLE_ID_REQUIRED'
  | 'USER_NOT_FOUND'
  | 'EMAIL_MISMATCH'
  | 'PHONE_MISMATCH'
  | 'CONTACT_MISSING'
  | 'CODE_REQUIRED'
  | 'VERIFICATION_TOKEN_REQUIRED'
  | 'VERIFICATION_TOKEN_INVALID'
  | 'VERIFICATION_TOKEN_EXPIRED'
  | 'VERIFICATION_TOKEN_ALREADY_USED';

export class MemberRechargeVerificationError extends Error {
  constructor(
    readonly code: MemberRechargeVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = MemberRechargeVerificationError.name;
  }
}

export interface MemberRechargeVerificationPort {
  sendCode(
    input: MemberRechargeSendCodeInput,
  ): Promise<MemberRechargeVerificationResult>;
  verifyCode(
    input: MemberRechargeVerifyCodeInput,
  ): Promise<MemberRechargeVerificationResult>;
  consumeVerificationToken(
    input: MemberRechargeConsumeTokenInput,
  ): Promise<void>;
}
