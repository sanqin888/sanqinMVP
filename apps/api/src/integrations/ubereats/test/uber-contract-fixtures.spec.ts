import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const parseJson = (text: string): unknown => {
  const value: unknown = JSON.parse(text);
  return value;
};

const hasContractVersion = (
  value: unknown,
): value is { contract_version: string } =>
  typeof value === 'object' &&
  value !== null &&
  'contract_version' in value &&
  typeof value.contract_version === 'string';

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
      'orders/cancel-request.json',
      'orders/deny-request.json',
      'orders/detail-modifiers.json',
      'orders/detail-promotion.json',
      'orders/detail-scheduled.json',
      'orders/detail.json',
      'orders/notification.json',
      'orders/ready-request.json',
      'stores/discovery.json',
      'stores/provision-request.json',
      'stores/provision-response.json',
      'webhooks/menus.notification.json',
      'webhooks/orders.failure.json',
      'webhooks/orders.notification.json',
      'webhooks/orders.scheduled.notification.json',
      'webhooks/store.deprovisioned.json',
      'webhooks/store.provisioned.json',
      'webhooks/store.status.changed.json',
    ]);
  });

  it('contains parseable synthetic JSON and no plausible credential or customer PII', () => {
    for (const path of files(root)) {
      const text = readFileSync(path, 'utf8');
      expect(() => {
        parseJson(text);
      }).not.toThrow();
      expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._~-]{12,}/i);
      expect(text).not.toMatch(/(?:sk|prod|live)[_-][A-Za-z0-9_-]{12,}/i);
      expect(text).not.toMatch(
        /"(?:phone|email|customer_name|first_name|last_name|address)"\s*:/i,
      );
    }
  });

  it('pins Activate Integration fixture to the writable 1.0.0 contract', () => {
    const value = parseJson(
      readFileSync(join(root, 'stores/provision-request.json'), 'utf8'),
    );
    expect(value).toMatchObject({
      allowed_customer_requests: {
        allow_single_use_items_requests: true,
        allow_special_instruction_requests: true,
      },
      integrator_store_id: 'fixture-store-001',
      is_order_manager: true,
      require_manual_acceptance: false,
      webhooks_config: {
        schedule_order_webhooks: { is_enabled: true },
        webhooks_version: '1.0.0',
      },
    });
    expect(value).not.toHaveProperty('order_manager_client_id');
    expect(value).not.toHaveProperty('integration_enabled');
    expect(value).not.toHaveProperty('pos_integration_enabled');
  });

  it('pins documentation to the same contract version', () => {
    const manifest: unknown = parseJson(
      readFileSync(join(root, 'manifest.json'), 'utf8'),
    );
    expect(hasContractVersion(manifest)).toBe(true);
    if (!hasContractVersion(manifest)) {
      throw new Error('Uber contract manifest must contain contract_version');
    }
    const matrix = readFileSync(
      join(__dirname, 'requirement-matrix.md'),
      'utf8',
    );
    expect(manifest.contract_version).toBe('v1');
    expect(matrix).toContain('wire contract v1');
  });
});
