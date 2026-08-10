import type { Response } from 'express';
import type {
  UberOAuthErrorCode,
  UberOAuthResult,
} from '../application/merchant/uber-merchant-oauth.service';

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[
        character
      ] ?? character,
  );

const errorMessages: Record<UberOAuthErrorCode, string> = {
  OAUTH_START_FAILED: '无法开始 Uber 授权，请重试或联系管理员。',
  OAUTH_CODE_MISSING: 'Uber 授权失败：缺少 code。',
  OAUTH_STATE_INVALID_OR_EXPIRED: '授权请求非法或已过期，请重新发起授权。',
  OAUTH_SESSION_MISMATCH: '当前会话与授权请求不匹配，请使用原管理员会话重试。',
  OAUTH_TEMPORARY_FAILURE: 'Uber 或本服务暂时不可用，请稍后重试此回调。',
  OAUTH_TERMINAL_FAILURE: '本次 Uber 授权无法完成，请重新发起授权。',
  OAUTH_COMPLETION_FAILED: '授权处理失败，请重试或联系管理员。',
};

export const presentOAuthStart = <T extends { authorizeUrl: string }>(
  result: UberOAuthResult<T>,
  response: Response,
) => {
  if (result.ok) return response.redirect(result.value.authorizeUrl);
  return response.status(502).send(errorMessages[result.error.code]);
};

export const presentOAuthCallback = <
  T extends {
    uberUserId: string;
    scope?: string | null;
    expiresAt?: Date | null;
  },
>(
  result: UberOAuthResult<T>,
): string => {
  if (!result.ok) {
    return `<!doctype html><html lang="zh-CN"><body><h2>Uber 授权失败</h2><p>${escapeHtml(errorMessages[result.error.code])}</p></body></html>`;
  }
  return `<!doctype html>
<html lang="zh-CN">
  <body>
    <h2>Uber 授权成功</h2>
    <p>连接已安全保存。你现在可以关闭此页面并返回管理后台。</p>
  </body>
</html>`;
};
