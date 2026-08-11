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
  OAUTH_USER_DENIED:
    '你已拒绝 Uber 授权。本次请求已安全终结，如需连接请重新发起。',
  OAUTH_AUTHORIZATION_INVALID: 'Uber 返回了无效的授权结果，请重新发起授权。',
  OAUTH_CODE_MISSING: 'Uber 授权失败：缺少 code。',
  OAUTH_STATE_INVALID_OR_EXPIRED: '授权请求非法或已过期，请重新发起授权。',
  OAUTH_SESSION_MISMATCH:
    '授权仅支持发起时的同一浏览器管理员会话。请返回原浏览器重新发起授权。',
  OAUTH_TEMPORARY_FAILURE: 'Uber 或本服务暂时不可用，请稍后重试此回调。',
  OAUTH_TERMINAL_FAILURE: '本次 Uber 授权无法完成，请重新发起授权。',
  OAUTH_COMPLETION_FAILED: '授权处理失败，请重试或联系管理员。',
};

export const presentOAuthStart = <T extends { authorizeUrl: string }>(
  result: UberOAuthResult<T>,
  response: Response,
) => {
  if (result.ok) {
    const authorizeUrl = escapeHtml(result.value.authorizeUrl);
    return response.status(200).send(`<!doctype html><html lang="zh-CN"><body>
      <h2>开始 Uber 授权</h2>
      <p>回调必须使用当前浏览器和当前已登录的管理员会话；请勿复制链接到其他设备或清除 Cookie。</p>
      <p><a href="${authorizeUrl}" rel="noreferrer">我已了解，继续前往 Uber</a></p>
    </body></html>`);
  }
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
