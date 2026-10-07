import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(
  resolve(__dirname, '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);
const contractSource = readFileSync(
  resolve(__dirname, 'accounting-posted-financial-correction.contract.ts'),
  'utf8',
);

const modelBlock = (modelName: string): string => {
  const match = schemaSource.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );
  if (!match) {
    throw new Error(`missing Prisma model: ${modelName}`);
  }
  return match[0];
};

describe('posted financial correction persistence architecture', () => {
  it('keeps persisted lifecycle vocabulary aligned with the A1 contract', () => {
    for (const value of ['DRAFT', 'READY', 'POSTED', 'CANCELLED']) {
      expect(schemaSource).toContain(value);
      expect(contractSource).toContain(`'${value}'`);
    }
    for (const value of ['PROVIDER_SETTLEMENT', 'EXPENSE']) {
      expect(schemaSource).toContain(value);
      expect(contractSource).toContain(`'${value}'`);
    }
    for (const value of ['DELTA', 'REVERSAL_REPOST', 'REVERSAL_ONLY']) {
      expect(schemaSource).toContain(value);
      expect(contractSource).toContain(`'${value}'`);
    }
    for (const value of ['REVERSAL', 'REPOST']) {
      expect(schemaSource).toContain(value);
      expect(contractSource).toContain(`'${value}'`);
    }
    for (const value of [
      'EXTRACTION_ERROR',
      'AMOUNT_ERROR',
      'CLASSIFICATION_ERROR',
      'MISSING_COMPONENT',
      'DUPLICATE_POSTING',
      'BUSINESS_FACT_ERROR',
      'OTHER',
    ]) {
      expect(schemaSource).toContain(value);
      expect(contractSource).toContain(`'${value}'`);
    }
    expect(contractSource).toContain(
      "'accounting.posted_financial_correction_preview.v1'",
    );
  });

  it('persists one polymorphic Accounting-owned correction case without owner-specific foreign keys', () => {
    const source = modelBlock('AccountingCorrectionCase');

    expect(source).toContain('correctionStableId');
    expect(source).toContain('version');
    expect(source).toContain('targetKind');
    expect(source).toContain('targetStableId');
    expect(source).toContain('targetVersion');
    expect(source).toContain('baseAuthoritySchema');
    expect(source).toContain('baseAuthorityHash');
    expect(source).toContain('baseJournalSetHash');
    expect(source).toContain('readyRevisionId');
    expect(source).toContain('readyPreviewSchema');
    expect(source).toContain('readyPreviewJson');
    expect(source).toContain('planHash');
    expect(source).not.toContain('providerDocumentId');
    expect(source).not.toContain('expenseDocumentId');
    expect(source).not.toContain('storeId');
  });

  it('keeps corrected business targets append-only and versioned', () => {
    const source = modelBlock('AccountingCorrectionRevision');

    expect(source).toContain('correctionRevisionStableId');
    expect(source).toContain('correctionCaseId');
    expect(source).toContain('revision');
    expect(source).toContain('targetAuthoritySchema');
    expect(source).toContain('targetAuthorityHash');
    expect(source).toContain('targetJson');
    expect(source).toContain(
      '@@unique([correctionCaseId, revision], map: "AcctCorrectionRevision_case_rev_key")',
    );
    expect(source).not.toContain('updatedAt');
    expect(source).not.toContain('deletedAt');
    expect(source).not.toContain('onDelete: Cascade');
  });

  it('links correction outputs to immutable Journal entries with restrictive ownership', () => {
    const source = modelBlock('AccountingCorrectionJournalOutput');

    expect(source).toContain('journalEntryId');
    expect(source).toContain('@unique @db.Uuid');
    expect(source).toContain('AccountingCorrectionJournalOutputRole');
    expect(source).toContain('onDelete: Restrict');
    expect(source).not.toContain('onDelete: Cascade');
    expect(source).not.toContain('updatedAt');
    expect(source).not.toContain('deletedAt');
  });
});
