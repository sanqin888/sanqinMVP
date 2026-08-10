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
  const value = result.value;
  return `<!doctype html>
<html lang="zh-CN">
  <body>
    <h2>Uber 授权成功</h2>
    <p>uberUserId: ${escapeHtml(value.uberUserId)}</p>
    <p>scope: ${escapeHtml(value.scope ?? '')}</p>
    <p>expiresAt: ${value.expiresAt ? new Date(value.expiresAt).toISOString() : 'unknown'}</p>
    <p>你现在可以关闭此页面，并继续调用 /integrations/ubereats/oauth/stores 或 /integrations/ubereats/oauth/provision。</p>
  </body>
</html>`;
};
