import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settlementsSource = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf8',
);

describe('Provider settlements supporting-evidence UX', () => {
  it('keeps non-statement evidence as archived support instead of an independent posting workflow', () => {
    expect(settlementsSource).toContain(
      "document.documentType !== 'STATEMENT'",
    );
    expect(settlementsSource).toContain('辅助 / 控制证据');
    expect(settlementsSource).toContain('只作为已确认证据保存');
    expect(settlementsSource).toContain('不是独立入账记录');
    expect(settlementsSource).toContain('识别明细只在收件箱阶段展示');
    expect(settlementsSource).not.toContain(
      'selectProviderFinancialSummaryLines(document.lines)',
    );
  });
});
