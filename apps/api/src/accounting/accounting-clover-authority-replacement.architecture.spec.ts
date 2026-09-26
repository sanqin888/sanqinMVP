import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICE = resolve(
  __dirname,
  'accounting-clover-authority-replacement.service.ts',
);
const POLICY = resolve(
  __dirname,
  'accounting-clover-authority-replacement.policy.ts',
);
const CONTROLLER = resolve(__dirname, 'accounting-reports.controller.ts');

const read = (path: string): string => readFileSync(path, 'utf8');

describe('Clover historical authority replacement preview boundary', () => {
  it('remains read-only and exposes no Journal posting path in Slice C', () => {
    const service = read(SERVICE);
    const policy = read(POLICY);
    const controller = read(CONTROLLER);
    const combined = [service, policy, controller].join('\n');

    expect(service).toContain("mode: 'READ_ONLY_PREVIEW'");
    expect(controller).toContain(
      "@Get('report/clover-authority-replacement-preview')",
    );
    expect(combined).not.toContain('createJournalEntry(');
    expect(combined).not.toContain('createProviderSettlement');
    expect(combined).not.toContain('recordProviderPaymentFactCutover(');
    expect(service).not.toContain('accountingJournalEntry.create');
    expect(service).not.toContain('accountingJournalEntry.update');
    expect(service).not.toContain('accountingJournalEntry.delete');
  });
});
