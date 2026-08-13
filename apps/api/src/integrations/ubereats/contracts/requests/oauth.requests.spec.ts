import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OAuthCallbackQuery } from './oauth.requests';

describe('Uber Eats OAuth request contracts', () => {
  it.each([
    ['error', 129],
    ['error_description', 1025],
    ['error_uri', 2049],
  ] as const)('限制不可信 OAuth %s 字段长度', (field, length) => {
    const query = plainToInstance(OAuthCallbackQuery, {
      state: 'valid-state',
      [field]: 'x'.repeat(length),
    });
    expect(validateSync(query).some((error) => error.property === field)).toBe(
      true,
    );
  });

  it('接受 OAuth 标准错误响应字段', () => {
    const query = plainToInstance(OAuthCallbackQuery, {
      state: 'valid-state',
      error: 'access_denied',
      error_description: 'The resource owner denied the request',
      error_uri: 'https://developer.example/errors/access-denied',
    });
    expect(validateSync(query)).toEqual([]);
  });
});
