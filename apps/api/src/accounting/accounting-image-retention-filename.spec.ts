import {
  accountingExpenseVendorName,
  accountingRetainedImageDisplayFilename,
  accountingRetainedImageFilename,
  accountingRetainedImageVendorFromFilename,
  normalizeAccountingImageVendorName,
} from './accounting-image-retention-filename';

describe('Accounting image retention filenames', () => {
  it('uses reviewed receipt date plus a four-digit random suffix for WebP files', () => {
    expect(
      accountingRetainedImageFilename(
        'Food Depot\nSupermarket',
        new Date('2026-09-19T04:00:00.000Z'),
        '4827',
      ),
    ).toBe('Food-Depot-Supermarket_20260919_4827.webp');
  });

  it('rejects a non-four-digit collision suffix', () => {
    expect(() =>
      accountingRetainedImageFilename(
        'Food Depot',
        new Date('2026-09-19T04:00:00.000Z'),
        '123',
      ),
    ).toThrow('random suffix must be 4 digits');
  });

  it('derives the OCR vendor from Textract expense evidence', () => {
    expect(
      accountingExpenseVendorName({
        textractEvidence: { vendorName: ' CANADIAN TIRE ' },
      }),
    ).toBe('CANADIAN TIRE');
    expect(accountingExpenseVendorName({})).toBeNull();
  });

  it('presents legacy retained images with vendor plus source timestamp', () => {
    expect(
      accountingRetainedImageDisplayFilename({
        retainedStoredUrl:
          '/api/v1/accounting/files/image-retention/acctart_abc-random.webp',
        vendorName: 'CANADIAN TIRE',
        fallbackTimestamp: new Date('2026-09-23T01:37:36.693Z'),
        originalFilename: 'image.jpg',
      }),
    ).toBe('CANADIAN-TIRE_20260923T013736693Z.webp');
  });

  it('preserves new physical retained filenames and can recover their vendor', () => {
    const url =
      '/api/v1/accounting/files/image-retention/Food-Depot_20260919_4827.webp';
    expect(
      accountingRetainedImageDisplayFilename({
        retainedStoredUrl: url,
        vendorName: 'Different OCR Name',
        fallbackTimestamp: new Date('2026-09-23T01:37:36.693Z'),
        originalFilename: 'image.jpg',
      }),
    ).toBe('Food-Depot_20260919_4827.webp');
    expect(accountingRetainedImageVendorFromFilename(url)).toBe('Food-Depot');
  });

  it('normalizes manually reviewed vendor text before naming', () => {
    expect(normalizeAccountingImageVendorName('  Food\n Depot  ')).toBe(
      'Food Depot',
    );
    expect(normalizeAccountingImageVendorName(null)).toBe('');
  });
});
