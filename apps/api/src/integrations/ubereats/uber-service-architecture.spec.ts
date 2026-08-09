import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN_SERVICES = [
  'menu',
  'merchant',
  'order',
  'operations',
  'webhook',
] as const;

const EXTRACTED_ENTRY_IDENTIFIERS = {
  menu: [
    'buildUberUploadMenuPayload',
    'validateUberMenuPayload(',
    'buildUberDraftEdges',
    'menuVersionHasResourceId',
    'syncUberMenuItemAvailability(',
  ],
  order: [
    'parseOrderPayload',
    'executeUberOrderAction',
    'processPendingUberOrderActions(',
    'mapEventTypeToOrderStatus',
  ],
  merchant: [
    'extractMerchantStores',
    'upsertStoreMapping',
    'exchangeAuthorizationCode(',
    'provisionStore(',
  ],
} as const;

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
      if (domain in EXTRACTED_ENTRY_IDENTIFIERS) {
        expect(source.split('\n').length).toBeLessThanOrEqual(20);
      }
      for (const identifier of domain in EXTRACTED_ENTRY_IDENTIFIERS
        ? EXTRACTED_ENTRY_IDENTIFIERS[
            domain as keyof typeof EXTRACTED_ENTRY_IDENTIFIERS
          ]
        : []) {
        expect(source).not.toContain(identifier);
      }
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
