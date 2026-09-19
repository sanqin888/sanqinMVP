import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_SRC_ROOT = resolve(__dirname, '..');
const PRISMA_SCHEMA = resolve(API_SRC_ROOT, '..', 'prisma', 'schema.prisma');
const ACCOUNTING_JOURNAL_SERVICE = resolve(
  __dirname,
  'accounting-journal.service.ts',
);
const ACCOUNTING_AUDIT_WRITER = resolve(
  __dirname,
  'accounting-audit-writer.ts',
);
const INBOX_CLASSIFICATION_WRITER = resolve(
  __dirname,
  'accounting-inbox-classification.writer.ts',
);

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function modelBlock(schema: string, modelName: string) {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm'),
  );
  if (!match) throw new Error(`Prisma model ${modelName} not found`);
  return match[1] ?? '';
}

describe('Phase 9 Slice 7-B Accounting actor/stable identity contract', () => {
  it('distinguishes human user stable identities from journal/audit actor references', () => {
    const schema = read(PRISMA_SCHEMA);
    const journal = modelBlock(schema, 'AccountingJournalEntry');
    const transaction = modelBlock(schema, 'AccountingTransaction');
    const expense = modelBlock(schema, 'AccountingExpenseDocument');
    const audit = modelBlock(schema, 'AccountingAuditLog');
    const period = modelBlock(schema, 'AccountingPeriodClose');

    expect(journal).toContain('createdByActorRef');
    expect(journal).toContain('updatedByActorRef');
    expect(journal).not.toContain('createdByUserStableId');
    expect(journal).not.toContain('updatedByUserStableId');

    expect(audit).toContain('operatorActorRef');
    expect(audit).not.toContain('operatorUserId');

    expect(transaction).toContain('createdByUserStableId');
    expect(transaction).toContain('updatedByUserStableId');
    expect(transaction).not.toContain('createdByUserId');
    expect(transaction).not.toContain('updatedByUserId');

    expect(expense).toContain('confirmedByUserStableId');
    expect(expense).not.toContain('confirmedByUserId');

    expect(period).toContain('closedByUserStableId');
    expect(period).not.toContain('closedByUserId');
  });

  it('writes automated Accounting actors through ActorRef fields rather than user identity fields', () => {
    const journalService = read(ACCOUNTING_JOURNAL_SERVICE);
    const auditWriter = read(ACCOUNTING_AUDIT_WRITER);
    const inboxClassificationWriter = read(INBOX_CLASSIFICATION_WRITER);

    expect(journalService).toContain('createdByActorRef: operator');
    expect(journalService).toContain('updatedByActorRef: operator');
    expect(auditWriter).toContain('operatorActorRef: input.operatorActorRef');
    expect(inboxClassificationWriter).toContain(
      'operatorActorRef: ACCOUNTING_INBOX_CLASSIFIER_ACTOR',
    );
  });
});
