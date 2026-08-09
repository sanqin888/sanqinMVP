import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN_SERVICES = [
  'menu',
  'merchant',
  'order',
  'operations',
  'webhook',
] as const;

describe('Uber Eats domain service architecture', () => {
  it.each(DOMAIN_SERVICES)(
    'keeps %s service declarations in focused shared modules',
    (domain) => {
      const source = readFileSync(
        join(__dirname, `uber-${domain}.service.ts`),
        'utf8',
      );
      const serviceHeader = source.slice(0, source.indexOf('@Injectable()'));

      expect(source).not.toContain(
        'eslint-disable @typescript-eslint/no-unused-vars',
      );
      expect(serviceHeader).not.toMatch(
        /(?:^|\n)(?:export\s+)?(?:class|interface|type|const|function)\s+Uber/,
      );
      expect(serviceHeader.split('\n').length).toBeLessThan(100);
    },
  );

  it('keeps payload and Prisma compatibility declarations separated by responsibility', () => {
    const orderTypes = readFileSync(
      join(__dirname, 'uber-order.types.ts'),
      'utf8',
    );
    const menuTypes = readFileSync(
      join(__dirname, 'uber-menu.types.ts'),
      'utf8',
    );
    const prismaTypes = readFileSync(
      join(__dirname, 'uber-prisma.types.ts'),
      'utf8',
    );

    expect(orderTypes).toContain('export type UberOrderDetailDto');
    expect(orderTypes).not.toContain('UberMenuUploadPayload');
    expect(menuTypes).toContain('export type UberMenuUploadPayload');
    expect(menuTypes).not.toContain('UberOrderDetailDto');
    expect(prismaTypes).toContain('export type UberOrderActionDelegate');
    expect(prismaTypes).not.toContain('UberOrderDetailDto');
  });
});
