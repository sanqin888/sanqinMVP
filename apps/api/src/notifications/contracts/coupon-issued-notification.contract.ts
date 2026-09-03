export const COUPON_ISSUED_NOTIFICATION = Symbol('COUPON_ISSUED_NOTIFICATION');

export type CouponIssuedNotificationReason =
  | 'SIGNUP_COMPLETED'
  | 'REFERRAL_QUALIFIED'
  | 'MARKETING_OPT_IN'
  | 'BIRTHDAY_MONTH'
  | 'TIER_UPGRADE';

export type CouponIssuedNotificationInput = {
  recipient: {
    userStableId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    language: 'ZH' | 'EN';
  };
  program: {
    titleZh: string | null;
    titleEn: string | null;
    programStableId: string;
    giftValue: string | null;
    reason: CouponIssuedNotificationReason | null;
  };
};

export type CouponIssuedNotificationResult = {
  ok: boolean;
  error?: string;
  sendId?: string;
  messageId?: string;
};

export interface CouponIssuedNotificationPort {
  notifyCouponIssued(
    input: CouponIssuedNotificationInput,
  ): Promise<CouponIssuedNotificationResult>;
}
