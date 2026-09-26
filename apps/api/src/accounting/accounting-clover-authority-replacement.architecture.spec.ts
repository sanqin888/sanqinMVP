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
const REPORTS_CONTROLLER = resolve(
  __dirname,
  'accounting-reports.controller.ts',
);
const SETTLEMENT_CONTROLLER = resolve(
  __dirname,
  'accounting-provider-settlement.controller.ts',
);

const read = (path: string): string => readFileSync(path, 'utf8');

describe('Clover historical authority replacement boundary', () => {
  it('keeps preview read-only while Slice D exposes posting only through the settlement transport', () => {
    const service = read(SERVICE);
    const policy = read(POLICY);
    const reportsController = read(REPORTS_CONTROLLER);
    const settlementController = read(SETTLEMENT_CONTROLLER);
    const combined = [
      service,
      policy,
      reportsController,
      settlementController,
    ].join('\n');

    expect(service).toContain("mode: 'READ_ONLY_PREVIEW'");
    expect(reportsController).toContain(
      "@Get('report/clover-authority-replacement-preview')",
    );
    expect(reportsController).not.toContain(
      "@Post('journal/clover-authority-replacement')",
    );
    expect(settlementController).toContain(
      "@Post('journal/clover-authority-replacement')",
    );
    expect(service).toContain('this.journal.createJournalEntry(');
    expect(combined).not.toContain('createProviderSettlement');
    expect(combined).not.toContain('recordProviderPaymentFactCutover(');
    expect(service).not.toContain('accountingJournalEntry.create');
    expect(service).not.toContain('accountingJournalEntry.update');
    expect(service).not.toContain('accountingJournalEntry.delete');
  });
});
