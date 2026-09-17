import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname);

function read(name: string): string {
  return readFileSync(resolve(ACCOUNTING_ROOT, name), 'utf8');
}

const CANONICAL_FINANCIAL_SERVICES = [
  'accounting-canonical-sale-posting.service.ts',
  'accounting-canonical-sale-replay.service.ts',
  'accounting-canonical-change-preview.service.ts',
  'accounting-canonical-change-execution.service.ts',
  'accounting-provider-settlement-preview.service.ts',
  'accounting-provider-settlement-execution.service.ts',
] as const;

describe('Accounting internal capability boundary', () => {
  it('keeps canonical financial services off the broad AccountingService facade', () => {
    for (const name of CANONICAL_FINANCIAL_SERVICES) {
      const source = read(name);
      expect(source).not.toContain("from './accounting.service'");
      expect(source).not.toContain('AccountingService');
    }
  });

  it('keeps AccountingOperationsService on the narrow Period capability', () => {
    const source = read('accounting-operations.service.ts');

    expect(source).toContain('AccountingPeriodService');
    expect(source).not.toContain("from './accounting.service'");
    expect(source).not.toContain('AccountingService');
  });

  it('keeps Period and Journal ownership out of the remaining broad AccountingService', () => {
    const source = read('accounting.service.ts');

    expect(source).toContain('AccountingPeriodService');
    expect(source).not.toMatch(/\b(?:closeMonth|reopenMonth|closeYear)\s*\(/);
    expect(source).not.toMatch(/\bcreateJournalEntry\s*\(/);
    expect(source).not.toMatch(/\bcreateCanonicalChangeJournalEntry\s*\(/);
    expect(source).not.toMatch(/\bcreateProviderSettlementReplacementGroup\s*\(/);
    expect(source).not.toMatch(/\.accountingJournal(?:Entry|Line)\./);
  });

  it('shares the existing Prisma composition seam instead of widening Runtime/Data import debt', () => {
    const module = read('accounting.module.ts');
    const period = read('accounting-period.service.ts');
    const journal = read('accounting-journal.service.ts');
    const broad = read('accounting.service.ts');

    expect(module).toContain('{ provide: ACCOUNTING_DB, useExisting: PrismaService }');
    for (const source of [period, journal, broad]) {
      expect(source).toContain('ACCOUNTING_DB');
      expect(source).not.toContain("../prisma/prisma.service");
    }
  });
});
