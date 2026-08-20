import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname);
const TEXT_EXTENSIONS = new Set(['.ts', '.json', '.md']);
const forbiddenOrderFragments = [
  ['/v2/eats/', 'order'].join(''),
  ['accept', '_pos_order'].join(''),
  ['deny', '_pos_order'].join(''),
] as const;

const files = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return files(path);
    const extension = path.slice(path.lastIndexOf('.'));
    return TEXT_EXTENSIONS.has(extension) ? [path] : [];
  });

describe('Uber Order Fulfillment API 1.0.0 architecture', () => {
  it('does not allow legacy Order detail/action API fragments to return anywhere in the bounded context', () => {
    const violations: string[] = [];
    for (const path of files(ROOT)) {
      const source = readFileSync(path, 'utf8');
      for (const fragment of forbiddenOrderFragments) {
        if (source.includes(fragment)) {
          violations.push(`${relative(ROOT, path)} -> ${fragment}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the Order gateway on Order Fulfillment while leaving Menu versioning independent', () => {
    const gateways = readFileSync(
      join(ROOT, 'infrastructure/uber-api/uber-resource.gateways.ts'),
      'utf8',
    );
    expect(gateways).toContain('UberOrderGateway extends PrefixGateway');
    expect(gateways).toContain(
      "protected readonly prefixes = ['/v1/delivery/order']",
    );
    expect(gateways).toContain('UberMenuGateway extends PrefixGateway');
    expect(gateways).toContain(
      "protected readonly prefixes = ['/v2/eats/stores']",
    );
  });

  it('pins Order detail and all four actions to eats.order', () => {
    const detail = readFileSync(
      join(ROOT, 'infrastructure/uber-api/uber-order-detail.gateway.ts'),
      'utf8',
    );
    const resource = readFileSync(
      join(ROOT, 'infrastructure/uber-api/uber-resource.gateways.ts'),
      'utf8',
    );
    expect(detail).toContain("scope: 'eats.order'");
    expect(detail).toContain('expand');
    expect(detail).toContain("expanded.add('carts')");
    expect(detail).toContain("expanded.add('payment')");
    expect(resource).toContain("ACCEPT: 'accept'");
    expect(resource).toContain("DENY: 'deny'");
    expect(resource).toContain("READY_FOR_PICKUP: 'ready'");
    expect(resource).toContain("CANCEL: 'cancel'");
    expect(resource).toContain("scope: 'eats.order'");
  });
});
