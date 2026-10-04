import { ServiceUnavailableException } from '@nestjs/common';
import { CloverWebClientConfigService } from './clover-web-client-config.service';

const originalEnv = {
  publicToken: process.env.CLOVER_WEB_PUBLIC_TOKEN,
  merchantId: process.env.CLOVER_MERCHANT_ID,
  sdkUrl: process.env.CLOVER_WEB_SDK_URL,
};

afterEach(() => {
  if (originalEnv.publicToken === undefined) {
    delete process.env.CLOVER_WEB_PUBLIC_TOKEN;
  } else {
    process.env.CLOVER_WEB_PUBLIC_TOKEN = originalEnv.publicToken;
  }
  if (originalEnv.merchantId === undefined) {
    delete process.env.CLOVER_MERCHANT_ID;
  } else {
    process.env.CLOVER_MERCHANT_ID = originalEnv.merchantId;
  }
  if (originalEnv.sdkUrl === undefined) {
    delete process.env.CLOVER_WEB_SDK_URL;
  } else {
    process.env.CLOVER_WEB_SDK_URL = originalEnv.sdkUrl;
  }
});

describe('CloverWebClientConfigService', () => {
  it('returns only browser-safe Clover configuration', () => {
    process.env.CLOVER_WEB_PUBLIC_TOKEN = 'public-token';
    process.env.CLOVER_MERCHANT_ID = 'merchant-id';
    process.env.CLOVER_WEB_SDK_URL = 'https://checkout.clover.com/sdk.js';

    expect(new CloverWebClientConfigService().getConfig()).toEqual({
      publicToken: 'public-token',
      merchantId: 'merchant-id',
      sdkUrl: 'https://checkout.clover.com/sdk.js',
    });
  });

  it.each([
    ['CLOVER_WEB_PUBLIC_TOKEN', ''],
    ['CLOVER_MERCHANT_ID', ''],
    ['CLOVER_WEB_SDK_URL', ''],
    ['CLOVER_WEB_SDK_URL', 'http://checkout.clover.com/sdk.js'],
  ])('fails closed for invalid %s', (key, value) => {
    process.env.CLOVER_WEB_PUBLIC_TOKEN = 'public-token';
    process.env.CLOVER_MERCHANT_ID = 'merchant-id';
    process.env.CLOVER_WEB_SDK_URL = 'https://checkout.clover.com/sdk.js';
    process.env[key] = value;

    expect(() => new CloverWebClientConfigService().getConfig()).toThrow(
      ServiceUnavailableException,
    );
  });
});
