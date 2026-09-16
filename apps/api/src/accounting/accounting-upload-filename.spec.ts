import { normalizeAccountingManualUploadFilename } from './accounting-upload-filename';

describe('normalizeAccountingManualUploadFilename', () => {
  it('repairs UTF-8 browser filenames decoded as latin1 by multipart parsing', () => {
    expect(
      normalizeAccountingManualUploadFilename(
        '6 2026_SanQ Roujiamo \u00e4\u00b8\u0089\u00e7\u00a7\u00a6\u00e8\u0082\u0089\u00e5\u00a4\u00b9\u00e9\u00a6\u008d.pdf',
      ),
    ).toBe('6 2026_SanQ Roujiamo 三秦肉夹馍.pdf');
  });

  it('keeps already-correct unicode filenames unchanged', () => {
    expect(normalizeAccountingManualUploadFilename('三秦肉夹馍.pdf')).toBe(
      '三秦肉夹馍.pdf',
    );
  });

  it('keeps ASCII filenames unchanged', () => {
    expect(normalizeAccountingManualUploadFilename('invoice-2026-06.pdf')).toBe(
      'invoice-2026-06.pdf',
    );
  });

  it('does not reinterpret invalid UTF-8 latin1 bytes', () => {
    expect(
      normalizeAccountingManualUploadFilename('café.pdf'),
    ).toBe('café.pdf');
  });
});
