import { normalizeAccountingImageOcrText } from './accounting-image-ocr';

describe('accounting image OCR text normalization', () => {
  it('preserves line structure while normalizing horizontal whitespace', () => {
    expect(
      normalizeAccountingImageOcrText(
        '  SANQ   RESTAURANT  \r\nInvoice\t#123\r\n\r\n\r\nTotal    $84.69  ',
      ),
    ).toBe('SANQ RESTAURANT\nInvoice #123\n\nTotal $84.69');
  });
});
