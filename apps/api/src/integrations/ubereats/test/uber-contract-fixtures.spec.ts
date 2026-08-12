/* eslint-disable @typescript-eslint/no-unsafe-return -- JSON.parse is the contract boundary under test */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, 'fixtures/uber-contract/v1');
const files = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

describe('versioned Uber wire fixtures', () => {
  it('covers every required external payload family', () => {
    expect(
      files(root)
        .map((path) => relative(root, path))
        .sort(),
    ).toEqual([
      'errors/rate-limited.json',
      'errors/unauthorized.json',
      'errors/upstream.json',
      'errors/validation.json',
      'manifest.json',
      'menu/confirmation.json',
      'menu/upload-request.json',
      'menu/upload-response.json',
      'oauth/token-error.json',
      'oauth/token-success.json',
      'orders/accept-request.json',
      'orders/deny-request.json',
      'orders/detail.json',
      'orders/notification.json',
      'orders/ready-request.json',
      'stores/discovery.json',
      'stores/provision-request.json',
      'stores/provision-response.json',
      'webhooks/orders.cancel.json',
      'webhooks/orders.notification.json',
      'webhooks/store.deprovisioned.json',
      'webhooks/store.provisioned.json',
      'webhooks/store.status.changed.json',
    ]);
  });

  it('contains parseable synthetic JSON and no plausible credential or customer PII', () => {
    for (const path of files(root)) {
      const text = readFileSync(path, 'utf8');
      expect(() => JSON.parse(text)).not.toThrow();
      expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._~-]{12,}/i);
      expect(text).not.toMatch(/(?:sk|prod|live)[_-][A-Za-z0-9_-]{12,}/i);
      expect(text).not.toMatch(
        /"(?:phone|email|customer_name|first_name|last_name|address)"\s*:/i,
      );
    }
  });

  it('pins documentation to the same contract version', () => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'manifest.json'), 'utf8'),
    ) as { contract_version: string };
    const matrix = readFileSync(
      join(__dirname, 'requirement-matrix.md'),
      'utf8',
    );
    expect(manifest.contract_version).toBe('v1');
    expect(matrix).toContain('wire contract v1');
  });
});
