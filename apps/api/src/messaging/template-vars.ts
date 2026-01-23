export type Lang = 'zh-CN' | 'en';

export type BaseVars = {
  brandName: string;
  siteUrl: string;
  supportEmail: string;
  supportPhone?: string;
  storeAddressLine?: string;
  smsSignature: string;
};

export type OtpVars = BaseVars & {
  code: string;
  expiresInMin: number;
  purpose?: string;
};

export type WelcomeVars = BaseVars & {
  userName?: string;
  claimUrl: string;
};

export type FirstSubVars = BaseVars & {
  userName?: string;
  manageUrl: string;
};

export type GiftIssuedVars = BaseVars & {
  userName?: string;
  giftName: string;
  giftValue: string;
  claimUrl: string;
};

export type OrderReadyVars = BaseVars & {
  pickupCode: string;
  pickupLocation?: string;
};

export type InvoiceVars = BaseVars & {
  invoiceNo: string;
  amount?: string;
  invoiceUrl: string;
  clientRequestId?: string;
};

export type TemplateVarsMap = {
  otp: OtpVars;
  welcome: WelcomeVars;
  Subscription: FirstSubVars;
  giftSignup: GiftIssuedVars;
  giftSubscription: GiftIssuedVars;
  giftReferral: GiftIssuedVars;
  giftBirthday: GiftIssuedVars;
  giftTierUpgrade: GiftIssuedVars;
  orderReady: OrderReadyVars;
  invoice: InvoiceVars;
};

export type TemplateName = keyof TemplateVarsMap;
