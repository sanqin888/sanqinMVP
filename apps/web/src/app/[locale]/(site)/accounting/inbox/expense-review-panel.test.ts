import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Inbox expense review UX guard', () => {
  it('keeps Aggregate categories clickable so the existing CAD guard can explain why aggregation is blocked', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain('if (!canAggregateRecognizedQuickRows)');
    const clickIndex = source.indexOf('onClick={aggregateQuickRows}');
    expect(clickIndex).toBeGreaterThan(-1);
    const buttonSlice = source.slice(clickIndex - 160, clickIndex + 220);
    expect(buttonSlice).not.toContain('disabled={!canAggregateRecognizedQuickRows}');
  });
});
