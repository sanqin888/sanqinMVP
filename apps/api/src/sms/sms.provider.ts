export type SmsSendParams = {
  to: string;
  body: string;
};

export type SmsSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};

export interface SmsProvider {
  sendSms(params: SmsSendParams): Promise<SmsSendResult>;
}
