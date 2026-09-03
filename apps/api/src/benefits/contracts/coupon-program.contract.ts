export const COUPON_PROGRAM_CLAIMS = Symbol('COUPON_PROGRAM_CLAIMS');
export const COUPON_PROGRAM_TRIGGER = Symbol('COUPON_PROGRAM_TRIGGER');
export const COUPON_PROGRAM_ADMIN_ISSUER = Symbol(
  'COUPON_PROGRAM_ADMIN_ISSUER',
);

export type CouponProgramTriggerType =
  | 'SIGNUP_COMPLETED'
  | 'REFERRAL_QUALIFIED'
  | 'MARKETING_OPT_IN'
  | 'BIRTHDAY_MONTH'
  | 'TIER_UPGRADE';

export type ClaimableCouponProgram = {
  programStableId: string;
  titleZh: string;
  titleEn: string | null;
  giftValue: string | null;
  validFrom: string | null;
  validTo: string | null;
  perUserLimit: number;
  issuedToUser: number;
  canClaim: boolean;
  unavailableReason: 'TOTAL_LIMIT_REACHED' | 'USER_LIMIT_REACHED' | null;
};

export type CouponProgramClaimResult = {
  programStableId: string;
  titleZh: string;
  titleEn: string | null;
  issuedCount: number;
};

export interface CouponProgramClaimsPort {
  listManualClaimPrograms(
    userStableId: string,
  ): Promise<ClaimableCouponProgram[]>;
  claimManual(
    userStableId: string,
    programStableId: string,
  ): Promise<CouponProgramClaimResult>;
  claimPromoCode(
    userStableId: string,
    code: string,
  ): Promise<CouponProgramClaimResult>;
}

export interface CouponProgramTriggerPort {
  issueProgramsForUser(
    triggerType: CouponProgramTriggerType,
    userStableId: string,
  ): Promise<{ issuedCount: number }>;
  issueBirthdayProgramsForMonth(
    targetDate?: Date,
  ): Promise<{ issuedCount: number; userCount: number }>;
}

export type AdminCouponProgramIssueInput = {
  userStableId?: string;
  normalizedPhone?: string;
};

export interface CouponProgramAdminIssuerPort {
  issueAdminPushProgram(
    programStableId: string,
    input: AdminCouponProgramIssueInput,
  ): Promise<{ issuedCount: number }>;
}
