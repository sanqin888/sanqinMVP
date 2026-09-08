import { CloverProviderConfig } from './clover-provider.config';

const CLOVER_CONFIG_KEYS = [
  'CLOVER_BASE',
  'CLOVER_MERCHANT_ID',
  'CLOVER_ACCESS_TOKEN',
  'CLOVER_WEBHOOK_AUTH_CODE',
  'CLOVER_STORE_STABLE_ID',
  'CLOVER_PLATFORM_API_BASE',
  'CLOVER_OAUTH_CLIENT_ID',
  'CLOVER_OAUTH_CLIENT_SECRET',
  'CLOVER_OAUTH_AUTHORIZE_BASE',
  'CLOVER_OAUTH_API_BASE',
  'CLOVER_OAUTH_CALLBACK_URL',
  'CLOVER_OAUTH_SCOPES',
  'CLOVER_TERMINAL_BASE',
  'CLOVER_DEVICE_ID',
  'CLOVER_REMOTE_APP_ID',
  'CLOVER_UNIFIED_MERCHANT_ID',
  'CLOVER_UNIFIED_STORE_STABLE_ID',
  'CLOVER_UNIFIED_PLATFORM_API_BASE',
  'CLOVER_UNIFIED_OAUTH_CLIENT_ID',
  'CLOVER_UNIFIED_OAUTH_CLIENT_SECRET',
  'CLOVER_UNIFIED_OAUTH_AUTHORIZE_BASE',
  'CLOVER_UNIFIED_OAUTH_API_BASE',
  'CLOVER_UNIFIED_OAUTH_CALLBACK_URL',
  'CLOVER_UNIFIED_OAUTH_SCOPES',
  'CLOVER_TERMINAL_API_BASE',
  'CLOVER_TERMINAL_OAUTH_TOKEN',
  'CLOVER_TERMINAL_DEVICE_ID',
  'CLOVER_TERMINAL_REMOTE_APP_ID',
  'CLOVER_TERMINAL_TIMEOUT_SECONDS',
] as const;

type CloverConfigKey = (typeof CLOVER_CONFIG_KEYS)[number];

const withEnvironment = (
  values: Partial<Record<CloverConfigKey, string | undefined>>,
  run: () => void,
): void => {
  const original = new Map(
    CLOVER_CONFIG_KEYS.map((key) => [key, process.env[key]] as const),
  );
  for (const key of CLOVER_CONFIG_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('CloverProviderConfig', () => {
  it('preserves the live Web Ecommerce configuration on the existing variables', () => {
    withEnvironment(
      {
        CLOVER_BASE: 'https://web-clover.example',
        CLOVER_MERCHANT_ID: 'web-merchant',
        CLOVER_ACCESS_TOKEN: 'web-token-fixture',
        CLOVER_WEBHOOK_AUTH_CODE: 'webhook-auth-fixture',
      },
      () => {
        const config = new CloverProviderConfig();

        expect(config.ecommerceApiBase).toBe('https://web-clover.example');
        expect(config.ecommerceMerchantId).toBe('web-merchant');
        expect(config.ecommerceAccessToken).toBe('web-token-fixture');
        expect(config.webhookAuthCode).toBe('webhook-auth-fixture');
      },
    );
  });

  it('does not inherit Unified or Terminal identity/endpoints from legacy Web or generic Clover variables', () => {
    withEnvironment(
      {
        CLOVER_BASE: 'https://web-production.example',
        CLOVER_MERCHANT_ID: 'web-production-merchant',
        CLOVER_ACCESS_TOKEN: 'web-production-token-fixture',
        CLOVER_STORE_STABLE_ID: 'legacy-store',
        CLOVER_PLATFORM_API_BASE: 'https://legacy-platform.example',
        CLOVER_OAUTH_CLIENT_ID: 'legacy-client',
        CLOVER_OAUTH_CLIENT_SECRET: 'legacy-secret-fixture',
        CLOVER_OAUTH_AUTHORIZE_BASE: 'https://legacy-authorize.example',
        CLOVER_OAUTH_API_BASE: 'https://legacy-oauth-api.example',
        CLOVER_OAUTH_CALLBACK_URL: 'https://legacy.example/callback',
        CLOVER_OAUTH_SCOPES: 'LEGACY_SCOPE',
        CLOVER_TERMINAL_BASE: 'https://legacy-terminal.example',
        CLOVER_TERMINAL_OAUTH_TOKEN: 'terminal-token-fixture',
        CLOVER_DEVICE_ID: 'legacy-device',
        CLOVER_REMOTE_APP_ID: 'legacy-raid',
      },
      () => {
        const config = new CloverProviderConfig();

        expect(config.unifiedMerchantId).toBeUndefined();
        expect(config.unifiedStoreStableId).toBeUndefined();
        expect(config.unifiedPlatformApiBase).toBeUndefined();
        expect(config.unifiedOauthClientId).toBeUndefined();
        expect(config.unifiedOauthClientSecret).toBeUndefined();
        expect(config.unifiedOauthAuthorizeBase).toBeUndefined();
        expect(config.unifiedOauthApiBase).toBeUndefined();
        expect(config.unifiedOauthCallbackUrl).toBeUndefined();
        expect(config.unifiedOauthScopesMetadata).toBeUndefined();
        expect(config.terminalApiBase).toBeUndefined();
        expect(config.terminalAccessToken).toBe('terminal-token-fixture');
        expect(config.terminalDeviceId).toBeUndefined();
        expect(config.terminalRemoteAppId).toBeUndefined();
        expect(config.terminalTimeoutSeconds).toBeUndefined();
      },
    );
  });

  it('reads only the explicit Unified and Terminal configuration families', () => {
    withEnvironment(
      {
        CLOVER_UNIFIED_MERCHANT_ID: 'unified-merchant',
        CLOVER_UNIFIED_STORE_STABLE_ID: '4750_Yonge_Street',
        CLOVER_UNIFIED_PLATFORM_API_BASE: 'https://platform.example/',
        CLOVER_UNIFIED_OAUTH_CLIENT_ID: 'unified-client',
        CLOVER_UNIFIED_OAUTH_CLIENT_SECRET: 'unified-secret-fixture',
        CLOVER_UNIFIED_OAUTH_AUTHORIZE_BASE: 'https://authorize.example/',
        CLOVER_UNIFIED_OAUTH_API_BASE: 'https://oauth-api.example/',
        CLOVER_UNIFIED_OAUTH_CALLBACK_URL: 'https://sanq.ca/clover/oauth/callback',
        CLOVER_UNIFIED_OAUTH_SCOPES: 'MERCHANT_READ,PAYMENTS_READ',
        CLOVER_TERMINAL_API_BASE: 'https://terminal.example/',
        CLOVER_TERMINAL_OAUTH_TOKEN: 'terminal-token-fixture',
        CLOVER_TERMINAL_DEVICE_ID: 'device-1',
        CLOVER_TERMINAL_REMOTE_APP_ID: 'raid-1',
        CLOVER_TERMINAL_TIMEOUT_SECONDS: '120',
      },
      () => {
        const config = new CloverProviderConfig();

        expect(config.unifiedMerchantId).toBe('unified-merchant');
        expect(config.unifiedStoreStableId).toBe('4750_Yonge_Street');
        expect(config.unifiedPlatformApiBase).toBe('https://platform.example');
        expect(config.unifiedOauthClientId).toBe('unified-client');
        expect(config.unifiedOauthClientSecret).toBe('unified-secret-fixture');
        expect(config.unifiedOauthAuthorizeBase).toBe('https://authorize.example');
        expect(config.unifiedOauthApiBase).toBe('https://oauth-api.example');
        expect(config.unifiedOauthCallbackUrl).toBe(
          'https://sanq.ca/clover/oauth/callback',
        );
        expect(config.unifiedOauthScopesMetadata).toBe(
          'MERCHANT_READ,PAYMENTS_READ',
        );
        expect(config.terminalApiBase).toBe('https://terminal.example');
        expect(config.terminalAccessToken).toBe('terminal-token-fixture');
        expect(config.terminalDeviceId).toBe('device-1');
        expect(config.terminalRemoteAppId).toBe('raid-1');
        expect(config.terminalTimeoutSeconds).toBe(120);
      },
    );
  });

  it.each([undefined, '', '9', '301', 'not-a-number'])(
    'treats missing or invalid Terminal timeout %p as unconfigured',
    (timeout) => {
      withEnvironment(
        {
          CLOVER_TERMINAL_TIMEOUT_SECONDS: timeout,
        },
        () => {
          expect(new CloverProviderConfig().terminalTimeoutSeconds).toBeUndefined();
        },
      );
    },
  );
});
