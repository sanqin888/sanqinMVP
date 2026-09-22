import {
  ACCOUNTING_SCANNED_PDF_RASTER_POLICY,
  inspectAccountingPdfPageCount,
  rasterizeAccountingPdfPage,
} from './accounting-pdf-rasterizer';

const pdf = Buffer.from('%PDF-1.7\n%%EOF', 'ascii');

describe('Accounting scanned PDF rasterizer', () => {
  it('reads a bounded page count from Poppler pdfinfo output', async () => {
    const runner = jest.fn(() =>
      Promise.resolve(
        'Title: sanitized\nPages:          3\nPDF version: 1.7\n',
      ),
    );

    await expect(inspectAccountingPdfPageCount(pdf, runner)).resolves.toBe(3);
    expect(runner).toHaveBeenCalledWith(pdf);
  });

  it('fails closed when page count is missing or invalid', async () => {
    await expect(
      inspectAccountingPdfPageCount(pdf, () =>
        Promise.resolve('Title: missing pages\n'),
      ),
    ).rejects.toThrow('page count is unavailable');
    await expect(
      inspectAccountingPdfPageCount(pdf, () => Promise.resolve('Pages: 0\n')),
    ).rejects.toThrow('page count is invalid');
  });

  it('requests one page at the fixed raster DPI', async () => {
    const raster = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const runner = jest.fn(() => Promise.resolve(raster));

    await expect(rasterizeAccountingPdfPage(pdf, 2, runner)).resolves.toBe(
      raster,
    );
    expect(runner).toHaveBeenCalledWith(
      pdf,
      2,
      ACCOUNTING_SCANNED_PDF_RASTER_POLICY.rasterDpi,
    );
  });

  it('rejects empty and oversized page raster output', async () => {
    await expect(
      rasterizeAccountingPdfPage(pdf, 1, () =>
        Promise.resolve(Buffer.alloc(0)),
      ),
    ).rejects.toThrow('page 1 raster is empty');

    await expect(
      rasterizeAccountingPdfPage(pdf, 1, () =>
        Promise.resolve(
          Buffer.alloc(
            ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxRasterPageBytes + 1,
          ),
        ),
      ),
    ).rejects.toThrow('page 1 raster exceeded byte limit');
  });

  it('rejects invalid PDF and page inputs before invoking Poppler runners', async () => {
    const infoRunner = jest.fn(() => Promise.resolve('Pages: 1\n'));
    await expect(
      inspectAccountingPdfPageCount(Buffer.from('not-pdf'), infoRunner),
    ).rejects.toThrow('input is invalid');
    expect(infoRunner).not.toHaveBeenCalled();

    const rasterRunner = jest.fn(() => Promise.resolve(Buffer.from('jpeg')));
    await expect(
      rasterizeAccountingPdfPage(pdf, 0, rasterRunner),
    ).rejects.toThrow('page number is invalid');
    expect(rasterRunner).not.toHaveBeenCalled();
  });
});
