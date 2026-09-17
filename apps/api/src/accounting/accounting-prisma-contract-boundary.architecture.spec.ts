import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = __dirname;

const read = (name: string) =>
  readFileSync(resolve(ACCOUNTING_ROOT, name), 'utf8');

const PRISMA_FREE_BOUNDARIES = [
  'accounting-contracts.ts',
  'accounting.controller.ts',
  'accounting-chart-of-accounts.ts',
  'accounting-journal-policy.ts',
  'accounting-canonical-sale-journal.policy.ts',
  'accounting-canonical-change-journal.policy.ts',
  'accounting-inbox-core.policy.ts',
  'accounting-inbox-core.orchestrator.ts',
  'accounting-inbox-acquisition.service.ts',
  'accounting-image-retention.service.ts',
  'accounting-gmail-ingest.service.ts',
  'accounting-provider-recognition.policy.ts',
  'accounting-provider-financial.parser.ts',
  'accounting-provider-financial.service.ts',
  'accounting-provider-financial-history.service.ts',
  'accounting-provider-settlement.policy.ts',
  'accounting-provider-settlement-write-authority.ts',
  'accounting-provider-settlement-preview.service.ts',
  'accounting-provider-settlement-execution.service.ts',
] as const;

const prismaNamedImport = (source: string): string =>
  source.match(/import\s*\{([^}]*)\}\s*from '@prisma\/client';/)?.[1] ?? '';

describe('Phase 9 Slice 7-C Accounting Prisma contract boundary', () => {
  it('keeps HTTP, application and policy contracts independent of Prisma-generated types', () => {
    for (const file of PRISMA_FREE_BOUNDARIES) {
      expect(read(file)).not.toContain('@prisma/client');
    }
  });

  it('keeps the owner contract framework- and persistence-neutral', () => {
    const contract = read('accounting-contracts.ts');

    expect(contract).not.toContain('@nestjs/');
    expect(contract).not.toContain('@prisma/client');
    expect(contract).not.toContain('PrismaService');
    expect(contract).not.toContain('../prisma/');
  });

  it('keeps mixed legacy services on owner enums while persistence mechanics retain only the Prisma namespace', () => {
    for (const file of [
      'accounting.service.ts',
      'accounting-operations.service.ts',
    ]) {
      const source = read(file);
      const prismaImport = prismaNamedImport(source);

      expect(prismaImport).toContain('Prisma');
      expect(prismaImport).not.toContain('Accounting');
      expect(source).toContain("from './accounting-contracts'");
    }
  });
});
