import type { AccountingInboxItem } from './inbox';

export type AccountingEvidenceFolder = {
  folderStableId: string;
  name: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountingManagedEvidenceFile = {
  artifactStableId: string;
  acquisitionMode: AccountingInboxItem['artifact']['acquisitionMode'];
  kind: AccountingInboxItem['artifact']['kind'];
  originalFilename: string | null;
  byteSize: number | null;
  createdAt: string;
  folder: {
    folderStableId: string;
    name: string;
    movedAt: string;
  } | null;
};

export type AccountingEvidenceFileManagerState = {
  folders: AccountingEvidenceFolder[];
  files: AccountingManagedEvidenceFile[];
  truncated: boolean;
  fileLimit: number;
};

export type AccountingEvidenceMoveResult = {
  requestedCount: number;
  movedCount: number;
  movedArtifactStableIds: string[];
  targetFolder: {
    folderStableId: string;
    name: string;
  } | null;
};
