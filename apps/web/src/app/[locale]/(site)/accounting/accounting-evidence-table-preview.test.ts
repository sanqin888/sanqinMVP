import { accountingEvidenceSupportsTabularPreview } from './accounting-evidence-table-preview';

describe('AccountingEvidenceTablePreview support', () => {
  it('supports CSV artifacts regardless of filename casing', () => {
    expect(
      accountingEvidenceSupportsTabularPreview({
        kind: 'CSV',
        filename: 'report.CSV',
      }),
    ).toBe(true);
  });

  it('supports XLSX stored as OTHER by filename', () => {
    expect(
      accountingEvidenceSupportsTabularPreview({
        kind: 'OTHER',
        filename: 'Fantuan_July.XLSX',
      }),
    ).toBe(true);
  });

  it('does not treat unrelated OTHER or PDF evidence as tabular', () => {
    expect(
      accountingEvidenceSupportsTabularPreview({
        kind: 'OTHER',
        filename: 'notes.txt',
      }),
    ).toBe(false);
    expect(
      accountingEvidenceSupportsTabularPreview({
        kind: 'PDF',
        filename: 'statement.pdf',
      }),
    ).toBe(false);
  });
});
