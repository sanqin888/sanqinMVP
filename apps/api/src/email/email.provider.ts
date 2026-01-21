export type EmailSendParams = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: Record<string, string>;
  fromName?: string;
  fromAddress?: string;
};

export type EmailSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export interface EmailProvider {
  sendEmail(params: EmailSendParams): Promise<EmailSendResult>;
}
