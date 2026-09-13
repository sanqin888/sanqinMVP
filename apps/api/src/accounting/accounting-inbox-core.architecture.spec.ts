import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname);
const API_SRC_ROOT = resolve(ACCOUNTING_ROOT, '..');
const API_ROOT = resolve(API_SRC_ROOT, '..');
const INBOX_WRITER = resolve(
  ACCOUNTING_ROOT,
  'accounting-inbox-core.writer.ts',
);
const INBOX_EXPENSE_WRITER = resolve(
  ACCOUNTING_ROOT,
  'accounting-inbox-expense.writer.ts',
);
const PROVIDER_FINANCIAL_REVIEW_WRITER = resolve(
  ACCOUNTING_ROOT,
  'accounting-provider-financial-review.writer.ts',
);
const INBOX_POLICY = resolve(
  ACCOUNTING_ROOT,
  'accounting-inbox-core.policy.ts',
);
const INBOX_ORCHESTRATOR = resolve(
  ACCOUNTING_ROOT,
  'accounting-inbox-core.orchestrator.ts',
);
const INBOX_ACQUISITION = resolve(
  ACCOUNTING_ROOT,
  'accounting-inbox-acquisition.service.ts',
);
const INBOX_QUERY = resolve(ACCOUNTING_ROOT, 'accounting-inbox-query.ts');
const PROVIDER_FINANCIAL_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-provider-financial.service.ts',
);
const PROVIDER_FINANCIAL_HISTORY = resolve(
  ACCOUNTING_ROOT,
  'accounting-provider-financial-history.service.ts',
);
const GMAIL_INGEST = resolve(
  ACCOUNTING_ROOT,
  'accounting-gmail-ingest.service.ts',
);
const ACCOUNTING_CONTROLLER = resolve(
  ACCOUNTING_ROOT,
  'accounting.controller.ts',
);
const INBOX_MIGRATION = resolve(
  API_ROOT,
  'prisma/migrations/20260912131500_phase9_slice5c_a_unified_inbox_core/migration.sql',
);

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

describe('Accounting unified Inbox core ownership boundary', () => {
  it('keeps Unified Inbox Prisma mutations inside the designated Accounting writers', () => {
    const delegate =
      'accounting(?:SourceArtifact|ParseRun|InboxItem|TrustedSender|ProviderFinancialDocument|ProviderFinancialLine|ProviderFinancialCoverage)';
    const mutationPattern = new RegExp(
      `\\.${delegate}\\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\\s*\\(`,
    );
    const allowedWriters = new Set([
      INBOX_WRITER,
      INBOX_EXPENSE_WRITER,
      PROVIDER_FINANCIAL_REVIEW_WRITER,
    ]);
    const offenders = productionTypescriptFiles(API_SRC_ROOT)
      .filter((path) => !allowedWriters.has(path))
      .filter((path) => mutationPattern.test(read(path)))
      .map((path) => relative(API_SRC_ROOT, path));

    expect(offenders).toEqual([]);
    expect(read(INBOX_WRITER)).toMatch(mutationPattern);
    expect(read(INBOX_EXPENSE_WRITER)).toMatch(mutationPattern);
    expect(read(PROVIDER_FINANCIAL_REVIEW_WRITER)).toMatch(mutationPattern);
  });

  it('does not add another Accounting PrismaService import boundary', () => {
    expect(read(INBOX_WRITER)).not.toContain('../prisma/prisma.service');
    expect(read(INBOX_POLICY)).not.toContain('../prisma/prisma.service');
    expect(read(INBOX_ORCHESTRATOR)).not.toContain('../prisma/prisma.service');
    expect(read(INBOX_EXPENSE_WRITER)).not.toContain(
      '../prisma/prisma.service',
    );
    expect(read(PROVIDER_FINANCIAL_REVIEW_WRITER)).not.toContain(
      '../prisma/prisma.service',
    );
    expect(read(INBOX_ACQUISITION)).not.toContain('../prisma/prisma.service');
    expect(read(INBOX_QUERY)).not.toContain('../prisma/prisma.service');
    expect(read(PROVIDER_FINANCIAL_SERVICE)).not.toContain(
      '../prisma/prisma.service',
    );
    expect(read(PROVIDER_FINANCIAL_HISTORY)).not.toContain(
      '../prisma/prisma.service',
    );
    expect(read(GMAIL_INGEST)).not.toContain('../prisma/prisma.service');
    expect(read(INBOX_WRITER)).toContain('Prisma.TransactionClient');
    expect(read(INBOX_EXPENSE_WRITER)).toContain('Prisma.TransactionClient');
    expect(read(PROVIDER_FINANCIAL_REVIEW_WRITER)).toContain(
      'Prisma.TransactionClient',
    );
  });

  it('keeps Gmail and manual file acquisition on the Unified Inbox path', () => {
    const gmail = read(GMAIL_INGEST);
    const acquisition = read(INBOX_ACQUISITION);
    const controller = read(ACCOUNTING_CONTROLLER);

    expect(gmail).not.toContain('accountingExpenseDocument');
    expect(gmail).toContain('acquireEmailBody');
    expect(gmail).toContain('acquireEmailAttachment');
    expect(acquisition).toContain('registerInboxArtifact');
    expect(controller).toContain("@Post('inbox/artifacts')");
    expect(controller).not.toContain("@Post('files/receipts')");
  });

  it('keeps Uber financial-history access on the External Channels public boundary', () => {
    const history = read(PROVIDER_FINANCIAL_HISTORY);
    expect(history).toContain('../integrations/ubereats/public-api');
    expect(history).not.toContain('../integrations/ubereats/application/');
    expect(history).not.toContain('../integrations/ubereats/infrastructure/');

    const deepUberImport =
      /from\s+['"]\.\.\/integrations\/ubereats\/(?:application|infrastructure)\//;
    const offenders = productionTypescriptFiles(ACCOUNTING_ROOT)
      .filter((path) => deepUberImport.test(read(path)))
      .map((path) => relative(ACCOUNTING_ROOT, path));
    expect(offenders).toEqual([]);
  });

  it('keeps 5C evidence persistence separate from Journal posting', () => {
    for (const writer of [
      INBOX_WRITER,
      INBOX_EXPENSE_WRITER,
      PROVIDER_FINANCIAL_REVIEW_WRITER,
    ]) {
      expect(read(writer)).not.toContain('accountingJournalEntry');
      expect(read(writer)).not.toContain('accountingJournalLine');
    }
  });

  it('pins the additive database invariants in the Slice 5C-A migration', () => {
    const migration = read(INBOX_MIGRATION);

    expect(migration).toContain(
      'CONSTRAINT "AccountingSourceArtifact_content_hash_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingParseRun_status_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingInboxItem_duplicate_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingInboxItem_materialized_entity_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingProviderFinancialDocument_revision_check" CHECK',
    );
    expect(migration).toContain(
      'CONSTRAINT "AccountingProviderFinancialCoverage_required_from_check" CHECK',
    );
    expect(migration).toContain("DATE '2026-06-01'");
    expect(migration).toContain(
      'CONSTRAINT "AccountingProviderFinancialCoverage_complete_check" CHECK',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "AccountingParseRun_artifactId_parserName_parserVersion_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "AccountingProviderFinancialDocument_artifactId_key"',
    );
    expect(migration).toContain('CREATE INDEX "AcctInbox_materialized_idx"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "AcctProviderFinDoc_identity_rev_key"',
    );
    expect(migration).toContain('CREATE INDEX "AcctProviderFinDoc_period_idx"');
    expect(migration).toContain(
      'CREATE INDEX "AcctProviderFinDoc_store_period_idx"',
    );
    expect(migration).not.toMatch(
      /DROP\s+(?:TABLE|COLUMN|TYPE)|ALTER\s+TABLE\s+"(?:AccountingExpenseDocument|PlatformSettlementRecord)"/i,
    );
  });
});
