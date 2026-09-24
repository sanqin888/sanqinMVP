import {
  accountingExpenseVendorName,
  accountingRetainedImageDisplayFilename,
  accountingRetainedImageFilename,
  accountingRetainedImageVendorFromFilename,
  normalizeAccountingImageVendorName,
} from './accounting-image-retention-filename';

describe('Accounting image retention filenames', () => {
  it('uses a sanitized vendor name plus generation timestamp for WebP files', () => {
    expect(
      accountingRetainedImageFilename(
        'Food Depot\nSupermarket',
        new Date('2026-09-24T20:30:45.123Z'),
      ),
    ).toBe('Food-Depot-Supermarket_20260924T203045123Z.webp');
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
      '/api/v1/accounting/files/image-retention/Food-Depot_20260924T203045123Z.webp';
    expect(
      accountingRetainedImageDisplayFilename({
        retainedStoredUrl: url,
        vendorName: 'Different OCR Name',
        fallbackTimestamp: new Date('2026-09-23T01:37:36.693Z'),
        originalFilename: 'image.jpg',
      }),
    ).toBe('Food-Depot_20260924T203045123Z.webp');
    expect(accountingRetainedImageVendorFromFilename(url)).toBe('Food-Depot');
  });

  it('normalizes manually reviewed vendor text before naming', () => {
    expect(normalizeAccountingImageVendorName('  Food\n Depot  ')).toBe(
      'Food Depot',
    );
    expect(normalizeAccountingImageVendorName(null)).toBe('');
  });
});
