import {
  accountingManagedEvidenceDisplayByteSize,
  accountingManagedEvidenceDisplayFilename,
  filterAccountingEvidenceFiles,
} from './accounting-evidence-file-manager';
import type { AccountingManagedEvidenceFile } from './contracts/evidence-file-manager';

const files: AccountingManagedEvidenceFile[] = [
  {
    artifactStableId: 'acctart_unfiled',
    acquisitionMode: 'MANUAL_UPLOAD',
    kind: 'PDF',
    originalFilename: 'unfiled.pdf',
    byteSize: 100,
    displayFilename: 'unfiled.pdf',
    displayByteSize: 100,
    createdAt: '2026-09-21T12:00:00.000Z',
    folder: null,
  },
  {
    artifactStableId: 'acctart_uber',
    acquisitionMode: 'MANUAL_UPLOAD',
    kind: 'PDF',
    originalFilename: 'uber.pdf',
    byteSize: 200,
    displayFilename: 'uber.pdf',
    displayByteSize: 200,
    createdAt: '2026-09-21T12:01:00.000Z',
    folder: {
      folderStableId: 'folder_uber',
      name: 'Uber Eats',
      movedAt: '2026-09-21T12:02:00.000Z',
    },
  },
];

describe('AccountingEvidenceFileManager filtering', () => {
  it('uses the retained-file projection for operator-visible filename and size', () => {
    const retainedFile: AccountingManagedEvidenceFile = {
      ...files[0],
      artifactStableId: 'acctart_retained',
      kind: 'IMAGE',
      originalFilename: 'image.jpg',
      byteSize: 3_822_143,
      displayFilename: 'Food-Depot-Supermarket_20260923T013424771Z.webp',
      displayByteSize: 411_770,
    };

    expect(accountingManagedEvidenceDisplayFilename(retainedFile)).toBe(
      'Food-Depot-Supermarket_20260923T013424771Z.webp',
    );
    expect(accountingManagedEvidenceDisplayByteSize(retainedFile)).toBe(411_770);
  });

  it('shows all files without changing their physical identity', () => {
    expect(filterAccountingEvidenceFiles(files, 'ALL')).toEqual(files);
  });

  it('treats missing assignment as the virtual Unfiled root', () => {
    expect(filterAccountingEvidenceFiles(files, 'UNFILED')).toEqual([
      files[0],
    ]);
  });

  it('filters by logical folder stable ID', () => {
    expect(filterAccountingEvidenceFiles(files, 'folder_uber')).toEqual([
      files[1],
    ]);
  });
});
