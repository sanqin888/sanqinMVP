import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GET } from './route';

describe('Web runtime health route', () => {
  it('reports Web-local process readiness without an API dependency', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      component: 'web',
    });
  });

  it('bypasses locale middleware so health never redirects', () => {
    const middleware = readFileSync(
      resolve(__dirname, '../../middleware.ts'),
      'utf8',
    );

    expect(middleware).toContain('pathname === "/health"');
  });
});
