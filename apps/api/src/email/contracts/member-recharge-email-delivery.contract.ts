export const MEMBER_RECHARGE_EMAIL_DELIVERY = Symbol(
  'MEMBER_RECHARGE_EMAIL_DELIVERY',
);

export type MemberRechargeEmailDeliveryInput = {
  to: string;
  code: string;
  expiresInMin: number;
  locale?: string;
  userStableId: string;
};

export type MemberRechargeEmailDeliveryResult = {
  ok: boolean;
  sendId: string;
  error?: string;
};

export interface MemberRechargeEmailDeliveryPort {
  sendRechargeVerificationEmail(
    input: MemberRechargeEmailDeliveryInput,
  ): Promise<MemberRechargeEmailDeliveryResult>;
}
