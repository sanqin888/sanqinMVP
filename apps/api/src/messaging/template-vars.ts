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
  giftTitle: string;
  giftMessage: string;
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

export type DeliveryDispatchFailedVars = BaseVars & {
  orderNumber: string;
  deliveryProvider: string;
  errorMessage: string;
  orderDetailUrl: string;
};

export type TemplateVarsMap = {
  otp: OtpVars;
  welcome: WelcomeVars;
  Subscription: FirstSubVars;
  giftGeneral: GiftIssuedVars;
  orderReady: OrderReadyVars;
  invoice: InvoiceVars;
  deliveryDispatchFailed: DeliveryDispatchFailedVars;
};

export type TemplateName = keyof TemplateVarsMap;
