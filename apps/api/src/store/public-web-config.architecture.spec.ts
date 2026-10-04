import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Public Web runtime config boundary', () => {
  const serviceSource = readFileSync(
    resolve(__dirname, 'public-web-config.service.ts'),
    'utf8',
  );
  const webRoot = resolve(__dirname, '../../../web/src');
  const googleMapsSource = readFileSync(
    resolve(webRoot, 'lib/googleMaps.ts'),
    'utf8',
  );
  const locationSource = readFileSync(
    resolve(webRoot, 'lib/location.ts'),
    'utf8',
  );

  it(
    'keeps browser Maps configuration distinct from server geocoding credentials',
    () => {
      expect(serviceSource).toContain('GOOGLE_MAPS_BROWSER_KEY');
      expect(serviceSource).not.toContain('GOOGLE_MAPS_API_KEY');
    },
  );

  it(
    'removes build-time Maps and Store coordinate variables from Web runtime source',
    () => {
      const source = googleMapsSource + '\n' + locationSource;
      expect(source).not.toMatch(
        /NEXT_PUBLIC_(?:GOOGLE_MAPS|STORE_LATITUDE|STORE_LONGITUDE)/,
      );
      expect(googleMapsSource).toContain('getPublicWebConfig');
    },
  );
});
