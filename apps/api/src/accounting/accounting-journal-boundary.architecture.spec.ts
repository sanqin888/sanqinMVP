import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { DEFAULT_ACCOUNTING_ACCOUNTS } from './accounting-chart-of-accounts';

const ACCOUNTING_ROOT = resolve(__dirname);
const API_SRC_ROOT = resolve(ACCOUNTING_ROOT, '..');
const API_ROOT = resolve(API_SRC_ROOT, '..');
const JOURNAL_WRITER = resolve(ACCOUNTING_ROOT, 'accounting.service.ts');
const JOURNAL_MIGRATION = resolve(
  API_ROOT,
  'prisma/migrations/20260912070000_phase9_slice5b_double_entry_core/migration.sql',
);
const STORE_BALANCE_LIABILITY_MIGRATION = resolve(
  API_ROOT,
  'prisma/migrations/20260913010000_phase9_slice5d_b1a_store_balance_liability_coa/migration.sql',
);
const ACCOUNTING_COA_SEED_MIGRATIONS = [
  JOURNAL_MIGRATION,
  STORE_BALANCE_LIABILITY_MIGRATION,
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function productionTypescriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...productionTypescriptFiles(path));
      continue;
    }
    if (
      path.endsWith('.ts') &&
      !path.endsWith('.spec.ts') &&
      !path.endsWith('.test.ts')
    ) {
      files.push(path);
    }
  }
  return files;
}

describe('Accounting double-entry journal ownership boundary', () => {
  it('keeps direct JournalEntry/JournalLine Prisma mutations in the Accounting journal writer only', () => {
    const mutationPattern =
      /\.accountingJournal(?:Entry|Line)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/;
    const offenders = productionTypescriptFiles(API_SRC_ROOT)
      .filter((path) => path !== JOURNAL_WRITER)
      .filter((path) => mutationPattern.test(read(path)))
      .map((path) => relative(API_SRC_ROOT, path));

    expect(offenders).toEqual([]);
    expect(read(JOURNAL_WRITER)).toMatch(mutationPattern);
  });

  it('pins the database-level journal invariants in the Slice 5B migration', () => {
    const migration = read(JOURNAL_MIGRATION);

    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalEntry_source_fact_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalEntry_idempotency_hash_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalEntry_currency_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalEntry_version_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalLine_line_no_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingJournalLine_debit_credit_check" CHECK',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "AccountingJournalEntry_balance_check"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "AccountingJournalLine_balance_check"',
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain(
      'PERFORM "assertAccountingJournalEntryBalanced"',
    );
  });

  it('keeps the TypeScript Chart of Accounts stable IDs synchronized with cumulative migration seeds', () => {
    const migrationSeeds = ACCOUNTING_COA_SEED_MIGRATIONS.map(read).join('\n');

    for (const account of DEFAULT_ACCOUNTING_ACCOUNTS) {
      expect(migrationSeeds).toContain(`'${account.accountStableId}'`);
    }
  });

  it('pins Store Balance principal to an active CAD liability account without seeding an opening journal', () => {
    const account = DEFAULT_ACCOUNTING_ACCOUNTS.find(
      ({ accountStableId }) =>
        accountStableId === 'account_store_balance_liability',
    );
    const migration = read(STORE_BALANCE_LIABILITY_MIGRATION);

    expect(account).toEqual({
      accountStableId: 'account_store_balance_liability',
      name: '储值余额负债',
      type: null,
      accountClass: 'LIABILITY',
    });
    expect(migration).toContain("'account_store_balance_liability'");
    expect(migration).toContain("'LIABILITY'");
    expect(migration).toContain("'CAD'");
    expect(migration).toContain('true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP');
    expect(migration).not.toContain('INSERT INTO "AccountingJournalEntry"');
  });
});
