import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settlementsSource = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf8',
);

describe('Provider settlements supporting-evidence UX', () => {
  it('labels non-statement evidence as non-actionable reconciliation support', () => {
    expect(settlementsSource).toContain(
      "document.documentType !== 'STATEMENT'",
    );
    expect(settlementsSource).toContain('每日 Closeout / 对账控制证据');
    expect(settlementsSource).toContain('控制 / 汇总金额');
    expect(settlementsSource).toContain(
      '无需 Shadow Preview、Replay 或再次入账操作',
    );
    expect(settlementsSource).toContain(
      'selectProviderFinancialSummaryLines(document.lines)',
    );
  });
});
