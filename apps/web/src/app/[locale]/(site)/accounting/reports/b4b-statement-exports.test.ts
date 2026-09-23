import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('B4-B Accounting statement export links', () => {
  it('exposes CSV/PDF downloads for both canonical statement views', () => {
    expect(pageSource).toContain('/api/v1/accounting/export/trial-balance');
    expect(pageSource).toContain('/api/v1/accounting/export/balance-movement');
    expect(pageSource).toContain('href={`${base}.pdf?${query}`}');
    expect(pageSource).toContain('href={`${base}.csv?${query}`}');
  });

  it('keeps statement exports on the same selected date range as the UI', () => {
    expect(pageSource).toContain(
      "const statementExportQuery = new URLSearchParams({ from, to }).toString();",
    );
    expect(pageSource).not.toContain(
      "new URLSearchParams({ from, to, groupBy, currency: 'CAD' })",
    );
  });
});
