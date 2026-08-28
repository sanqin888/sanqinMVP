import type { CloverProviderConfig } from '../clover-provider.config';
import {
  CloverMerchantAuthorizationError,
  type CloverMerchantAuthorizationService,
} from './clover-merchant-authorization.service';
import { CloverMerchantOAuthController } from './clover-merchant-oauth.controller';

const config = {
  oauthCallbackUrl: 'https://sanq.ca/clover/oauth/callback',
} as unknown as CloverProviderConfig;

describe('CloverMerchantOAuthController', () => {
  it('redirects start directly to Clover authorize without exposing an intermediate JSON payload', async () => {
    const authorization = {
      start: jest
        .fn()
        .mockResolvedValue('https://www.clover.com/oauth/v2/authorize?state=opaque'),
    } as unknown as CloverMerchantAuthorizationService;
    const controller = new CloverMerchantOAuthController(authorization, config);

    await expect(
      controller.start({ merchant_id: 'MERCHANT123' }),
    ).resolves.toEqual({
      url: 'https://www.clover.com/oauth/v2/authorize?state=opaque',
      statusCode: 302,
    });
  });

  it('redirects a successful callback to the non-sensitive browser result page', async () => {
    const authorization = {
      complete: jest.fn().mockResolvedValue({
        merchantId: 'MERCHANT123',
        merchantName: 'SanQ Roujiamo',
        storeStableId: '4750_Yonge_Street',
        status: 'ACTIVE',
      }),
    } as unknown as CloverMerchantAuthorizationService;
    const controller = new CloverMerchantOAuthController(authorization, config);

    const result = await controller.callback({
      code: 'authorization-code',
      state: 'opaque-state',
      merchant_id: 'MERCHANT123',
    });
    const url = new URL(result.url);

    expect(result.statusCode).toBe(303);
    expect(url.origin + url.pathname).toBe(
      'https://sanq.ca/clover/oauth/result',
    );
    expect(url.searchParams.get('status')).toBe('success');
    expect(url.searchParams.get('merchant')).toBe('SanQ Roujiamo');
    expect(url.searchParams.get('storeStableId')).toBe(
      '4750_Yonge_Street',
    );
    expect(url.toString()).not.toContain('authorization-code');
    expect(url.toString()).not.toContain('opaque-state');
  });

  it('renders only a safe reason code on callback failure', async () => {
    const authorization = {
      complete: jest
        .fn()
        .mockRejectedValue(
          new CloverMerchantAuthorizationError('INVALID_STATE'),
        ),
    } as unknown as CloverMerchantAuthorizationService;
    const controller = new CloverMerchantOAuthController(authorization, config);

    const result = await controller.callback({
      code: 'sensitive-code',
      state: 'sensitive-state',
      merchant_id: 'MERCHANT123',
    });

    expect(result).toEqual({
      url: 'https://sanq.ca/clover/oauth/result?status=failure&reason=INVALID_STATE',
      statusCode: 303,
    });
  });
});
