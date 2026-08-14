/** Uber 官方公开文档所述的、无前缀十六进制 HMAC-SHA256 签名格式。 */
export const UBER_WEBHOOK_SIGNATURE_VERSION = 'hmac-sha256-hex-v1' as const;

export type UberWebhookSignatureVersion = typeof UBER_WEBHOOK_SIGNATURE_VERSION;

<<<<<<< HEAD
/** Domain lifecycle states recognized from Uber menu publication notifications. */
export type UberMenuNotificationStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED';

=======
>>>>>>> origin/main
/** 与 Nest、Express 及 Node HTTP header 类型无关的签名验证边界。 */
export type UberWebhookHeaderValue = string | readonly string[] | undefined;

export type UberWebhookVerificationInput = {
  readonly version: UberWebhookSignatureVersion;
  readonly headers: Readonly<Record<string, UberWebhookHeaderValue>>;
  /** 必须是 HTTP 层未经解析、重排或重新序列化的请求正文。 */
  readonly rawBody: Uint8Array;
};

export type UberWebhookInput = {
  headers: Readonly<Record<string, UberWebhookHeaderValue>>;
<<<<<<< HEAD
  /** HTTP 层未经解析、重排或重新序列化的请求正文字节。 */
  rawBody: Uint8Array;
=======
  /** @deprecated The service always parses the signed rawBody instead. */
  body?: unknown;
  rawBody: string | Uint8Array;
>>>>>>> origin/main
};
