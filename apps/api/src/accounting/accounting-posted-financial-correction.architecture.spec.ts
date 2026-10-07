import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const policySource = readFileSync(
  resolve(__dirname, 'accounting-posted-financial-correction.policy.ts'),
  'utf8',
);
const contractSource = readFileSync(
  resolve(__dirname, 'accounting-posted-financial-correction.contract.ts'),
  'utf8',
);

describe('posted financial correction foundation architecture', () => {
  it('keeps the common correction policy provider-neutral and persistence-neutral', () => {
    for (const source of [policySource, contractSource]) {
      expect(source).not.toContain('@prisma/client');
      expect(source).not.toContain('@nestjs/common');
      expect(source).not.toContain('FANTUAN');
      expect(source).not.toContain('UBER_EATS');
      expect(source).not.toContain('CLOVER');
    }
  });

  it('keeps posting-vector comparison dimensioned by account and category', () => {
    expect(contractSource).toContain('accountStableId: string');
    expect(contractSource).toContain('categoryStableId: string | null');
    expect(policySource).toContain('postingVectorKey');
    expect(policySource).toContain('currentEffectiveJournalSet');
    expect(policySource).toContain('priorCorrectionJournalSet');
  });

  it('reserves one dedicated correction source-fact identity for later typed Journal writes', () => {
    expect(contractSource).toContain(
      "'accounting.posted_financial_correction.v1'",
    );
    expect(contractSource).toContain("'PROVIDER_SETTLEMENT'");
    expect(contractSource).toContain("'EXPENSE'");
  });
});
