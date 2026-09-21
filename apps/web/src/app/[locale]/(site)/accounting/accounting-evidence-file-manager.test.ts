import {
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
    createdAt: '2026-09-21T12:00:00.000Z',
    folder: null,
  },
  {
    artifactStableId: 'acctart_uber',
    acquisitionMode: 'MANUAL_UPLOAD',
    kind: 'PDF',
    originalFilename: 'uber.pdf',
    byteSize: 200,
    createdAt: '2026-09-21T12:01:00.000Z',
    folder: {
      folderStableId: 'folder_uber',
      name: 'Uber Eats',
      movedAt: '2026-09-21T12:02:00.000Z',
    },
  },
];

describe('AccountingEvidenceFileManager filtering', () => {
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
