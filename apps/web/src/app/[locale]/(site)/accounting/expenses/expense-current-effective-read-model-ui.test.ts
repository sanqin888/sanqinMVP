import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const contractsSource = readFileSync(
  resolve(__dirname, '../contracts/expenses.ts'),
  'utf8',
);
const recordsSource = readFileSync(
  resolve(__dirname, 'expense-records-panel.tsx'),
  'utf8',
);

describe('Expense current-effective read-model UI', () => {
  it('keeps original and current-effective authority separate', () => {
    expect(contractsSource).toContain('originalPersisted');
    expect(contractsSource).toContain('currentEffective');
    expect(contractsSource).toContain("'ORIGINAL' | 'POSTED_CORRECTION'");
    expect(contractsSource).toContain('targetAuthorityHash');
  });

  it('shows original total beside corrected current-effective values', () => {
    expect(recordsSource).toContain(
      "document.currentEffective.source === 'POSTED_CORRECTION'",
    );
    expect(recordsSource).toContain('document.originalPersisted.totalCents');
    expect(recordsSource).toContain('Current effective · original');
    expect(recordsSource).toContain('筛选按当前有效值');
  });
});
