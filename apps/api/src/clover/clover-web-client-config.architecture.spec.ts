import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Clover Web client runtime-config boundary', () => {
  const serviceSource = readFileSync(
    resolve(__dirname, 'clover-web-client-config.service.ts'),
    'utf8',
  );
  const controllerSource = readFileSync(
    resolve(__dirname, 'clover-pay.controller.ts'),
    'utf8',
  );
  const walletRoot = resolve(
    __dirname,
    '../../../web/src/app/[locale]/(site)/wallet',
  );
  const walletSources = ['card-pay', 'apple-pay', 'google-pay']
    .map((name) => readFileSync(resolve(walletRoot, name, 'page.tsx'), 'utf8'))
    .join('\n');

  it('exposes only the dedicated browser-safe Clover config family', () => {
    expect(serviceSource).toContain('CLOVER_WEB_PUBLIC_TOKEN');
    expect(serviceSource).toContain('CLOVER_MERCHANT_ID');
    expect(serviceSource).toContain('CLOVER_WEB_SDK_URL');
    expect(serviceSource).not.toMatch(
      /CLOVER_(?:ACCESS_TOKEN|WEBHOOK_AUTH_CODE|UNIFIED_OAUTH_CLIENT_SECRET|TERMINAL_)/,
    );
  });

  it('adds browser config to the existing payment-session read contract', () => {
    expect(controllerSource).toContain('this.webClientConfig.getConfig()');
    expect(controllerSource).toContain('cloverClientConfig');
  });

  it('removes build-time Clover variables from Web payment pages', () => {
    expect(walletSources).not.toContain('NEXT_PUBLIC_CLOVER_');
    expect(walletSources).toContain('cloverClientConfig');
  });
});
