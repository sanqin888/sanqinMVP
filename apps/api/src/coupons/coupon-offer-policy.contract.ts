export const COUPON_OFFER_POLICY = Symbol('COUPON_OFFER_POLICY');
export const COUPON_OFFER_ADMIN = Symbol('COUPON_OFFER_ADMIN');

export type CouponJsonValue =
  | string
  | number
  | boolean
  | null
  | CouponJsonValue[]
  | { [key: string]: CouponJsonValue };

export type CouponJsonObject = { [key: string]: CouponJsonValue };

export type CouponProgramItem = {
  couponStableId: string;
  quantity: number;
};

export interface CouponOfferPolicyPort {
  validateUseRule(value: unknown): CouponJsonObject;
  parseAndValidateProgramItems(value: unknown): Promise<CouponProgramItem[]>;
}

export type CouponTemplateAdminInput = {
  couponStableId?: string;
  tittleCh?: string | null;
  titleEn?: string | null;
  description?: string | null;
  stackingPolicy?: 'EXCLUSIVE' | 'STACKABLE';
  validFrom?: string | null;
  validTo?: string | null;
  useRule: unknown;
  issueRule?: unknown | null;
};

export type CouponProgramAdminInput = {
  programStableId?: string;
  tittleCh: string;
  tittleEn?: string | null;
  giftValue?: string | null;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  distributionType?:
    | 'AUTOMATIC_TRIGGER'
    | 'MANUAL_CLAIM'
    | 'PROMO_CODE'
    | 'ADMIN_PUSH';
  triggerType?:
    | 'SIGNUP_COMPLETED'
    | 'REFERRAL_QUALIFIED'
    | 'MARKETING_OPT_IN'
    | 'BIRTHDAY_MONTH'
    | 'TIER_UPGRADE'
    | null;
  validFrom?: string | null;
  validTo?: string | null;
  promoCode?: string | null;
  totalLimit?: number | null;
  perUserLimit?: number | null;
  items: unknown;
};

export interface CouponOfferAdminPort {
  listTemplates(): Promise<unknown[]>;
  getTemplate(couponStableId: string): Promise<unknown>;
  createTemplate(input: CouponTemplateAdminInput): Promise<unknown>;
  updateTemplate(
    couponStableId: string,
    input: CouponTemplateAdminInput,
  ): Promise<unknown>;
  listPrograms(): Promise<unknown[]>;
  getProgram(programStableId: string): Promise<unknown>;
  createProgram(input: CouponProgramAdminInput): Promise<unknown>;
  updateProgram(
    programStableId: string,
    input: CouponProgramAdminInput,
  ): Promise<unknown>;
}
